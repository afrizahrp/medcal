import { createHash } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  BUSINESS_TIME_ZONE,
  DocumentNumberCollisionError,
  DocumentNumberSequenceExhaustedError,
  DocumentNumberService,
  Prisma,
  prisma,
  type CertificateSource,
  type CertificateStatus,
  type MembershipRole,
} from "@medcal/db";
import QRCode from "qrcode";
import { FilesService } from "../files/files.service";
import type { UploadedFile } from "../files/files.constants";
import { validateUpload } from "../files/file-validation";
import { recordAuditLog } from "./audit-log";
import { certificateFileOwnerPolicy } from "./certificate-file-owner-policy";
import { normalizeExternalCertificateNumber } from "./certificate-number";
import { generatedCertificateFilename, renderGeneratedCertificatePdf } from "./certificate-pdf";
import { buildVerificationUrl, generateVerificationToken } from "./certificate-verification-token";

const CERTIFICATE_OWNER_TYPE = "CERTIFICATE" as const;

export const CERTIFICATE_ACTIONS = {
  UPLOADED: "CERTIFICATE_UPLOADED",
  REPLACED: "CERTIFICATE_REPLACED",
  DOWNLOADED: "CERTIFICATE_DOWNLOADED",
  DELETED: "CERTIFICATE_DELETED",
  ISSUED: "CERTIFICATE_ISSUED",
  PDF_GENERATED: "CERTIFICATE_PDF_GENERATED",
  PDF_GENERATION_FAILED: "CERTIFICATE_PDF_GENERATION_FAILED",
} as const;

export interface CertificateRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CertificateVersion {
  id: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  uploadedByUserId: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

export interface CertificateDetail {
  id: string;
  calibrationJobId: string;
  number: string;
  source: CertificateSource;
  status: CertificateStatus;
  issuedAt: Date | null;
  validUntil: Date | null;
  /** Public verification URL the QR points at; null until issued or when the portal origin is not configured. */
  verificationUrl: string | null;
  currentVersionId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  versions: CertificateVersion[];
}

const CERTIFICATE_NOT_FOUND = new NotFoundException({
  code: "CERTIFICATE_NOT_FOUND",
  message: "No certificate exists for this calibration job",
});

const JOB_NOT_FOUND = new NotFoundException({
  code: "CALIBRATION_JOB_NOT_FOUND",
  message: "Calibration job not found",
});

type CertificateRow = Prisma.CertificateGetPayload<Record<string, never>>;

function uniqueViolationTarget(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return String(err.meta?.target ?? "");
  }
  return null;
}

const NUMBER_DUPLICATE = () =>
  new ConflictException({
    code: "CERTIFICATE_NUMBER_DUPLICATE",
    message: "This certificate number is already used by another certificate in this company",
  });

/**
 * Certificate is 1:1 with CalibrationJob (`calibrationJobId @unique`, final)
 * and has two explicit sources:
 *
 * - UPLOADED — produced outside Medcal and uploaded. The user supplies the
 *   number printed on that certificate (never parsed from the filename); it is
 *   stored verbatim after validation. The external certificate is already
 *   issued, so the row is created ISSUED with a verificationToken. No Medcal
 *   number is allocated. PDF versions keep the existing history behaviour.
 *   A legacy DRAFT row (historical Medcal-allocated CER number) is NEVER
 *   renumbered or promoted by an upload: such a job is rejected with
 *   CERTIFICATE_LEGACY_DRAFT_EXISTS until a separate, audited correction task
 *   exists.
 * - GENERATED — issued by Medcal. The row is created AT ISSUE (never as a
 *   number-bearing draft): number allocated from the dedicated
 *   CERTIFICATE_GENERATED sequence, token generated and status ISSUED in one
 *   transaction; the PDF is rendered afterwards from the persisted row.
 *
 * Once ISSUED, number / source / verificationToken / issuedAt are immutable:
 * no code path writes them again after the issuing transaction.
 */
@Injectable()
export class CertificateService {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  private async requireJob(companyId: string, calibrationJobId: string) {
    const job = await prisma.calibrationJob.findFirst({
      where: { id: calibrationJobId, companyId },
      select: {
        id: true,
        deviceId: true,
        status: true,
        workOrder: { select: { customerId: true } },
      },
    });
    if (!job) throw JOB_NOT_FOUND;
    return job;
  }

  private async toDetail(companyId: string, certificate: CertificateRow): Promise<CertificateDetail> {
    const fileObjects = await prisma.fileObject.findMany({
      where: { companyId, ownerType: CERTIFICATE_OWNER_TYPE, ownerId: certificate.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        checksum: true,
        uploadedByUserId: true,
        createdAt: true,
      },
    });
    return {
      id: certificate.id,
      calibrationJobId: certificate.calibrationJobId,
      number: certificate.number,
      source: certificate.source,
      status: certificate.status,
      issuedAt: certificate.issuedAt,
      validUntil: certificate.validUntil,
      verificationUrl: certificate.verificationToken
        ? buildVerificationUrl(certificate.verificationToken)
        : null,
      currentVersionId: certificate.pdfFileObjectId,
      createdByUserId: certificate.createdByUserId,
      updatedByUserId: certificate.updatedByUserId,
      createdAt: certificate.createdAt,
      updatedAt: certificate.updatedAt,
      versions: fileObjects.map((f) => ({ ...f, isCurrent: f.id === certificate.pdfFileObjectId })),
    };
  }

  /** Returns null (not 404) when the job exists but has no certificate yet — a normal, QA-independent state. */
  async getForJob(companyId: string, calibrationJobId: string): Promise<CertificateDetail | null> {
    await this.requireJob(companyId, calibrationJobId);
    const certificate = await prisma.certificate.findUnique({ where: { calibrationJobId } });
    if (!certificate) return null;
    return this.toDetail(companyId, certificate);
  }

  private async requireCertificateForJob(companyId: string, calibrationJobId: string) {
    await this.requireJob(companyId, calibrationJobId);
    const certificate = await prisma.certificate.findUnique({ where: { calibrationJobId } });
    if (!certificate) throw CERTIFICATE_NOT_FOUND;
    return certificate;
  }

  /**
   * PNG of the QR code for the certificate's public verification URL — a
   * locator only (the opaque token), for staff to print or place next to an
   * uploaded external certificate. 404 until the certificate has a token.
   */
  async getQrPng(companyId: string, calibrationJobId: string): Promise<Buffer> {
    const certificate = await this.requireCertificateForJob(companyId, calibrationJobId);
    const url = certificate.verificationToken ? buildVerificationUrl(certificate.verificationToken) : null;
    if (!url) {
      throw new ConflictException({
        code: "CERTIFICATE_VERIFICATION_URL_UNAVAILABLE",
        message: "This certificate has no verification URL (not issued, or the customer portal URL is not configured)",
      });
    }
    return QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
  }

  /** A number another certificate in this company already uses (case-insensitive), excluding `exceptCertificateId`. */
  private async assertNumberFree(companyId: string, number: string, exceptCertificateId?: string) {
    const clash = await prisma.certificate.findFirst({
      where: {
        companyId,
        number: { equals: number, mode: "insensitive" },
        ...(exceptCertificateId ? { NOT: { id: exceptCertificateId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw NUMBER_DUPLICATE();
  }

  /**
   * Upload an EXTERNAL certificate (source = UPLOADED) for a job.
   *
   * - `certificateNumber` is the number printed on the certificate; required
   *   when the certificate is first established. It is never taken from the
   *   filename.
   * - First upload creates the row ISSUED with a verificationToken (the
   *   external certificate is already issued) and allocates NO Medcal number.
   * - A legacy DRAFT row (created before this flow existed, carrying a
   *   Medcal-allocated CER number) is left untouched: the upload is rejected
   *   (409 CERTIFICATE_LEGACY_DRAFT_EXISTS). Legacy correction is a separate,
   *   future task; nothing here renumbers or converts historical records.
   * - An already ISSUED row only accepts a replacement PDF; its number is
   *   immutable. GENERATED certificates are never replaceable.
   */
  async uploadVersion(
    companyId: string,
    calibrationJobId: string,
    userId: string,
    role: MembershipRole,
    file: UploadedFile | undefined,
    certificateNumber: unknown,
    ctx: CertificateRequestContext,
  ): Promise<CertificateDetail> {
    // Reject a bad/missing file before anything is written.
    validateUpload(file, certificateFileOwnerPolicy.fileTypePolicy);

    const job = await this.requireJob(companyId, calibrationJobId);
    const existing = await prisma.certificate.findUnique({ where: { calibrationJobId } });

    if (existing?.source === "GENERATED") {
      throw new ConflictException({
        code: "CERTIFICATE_GENERATED_IMMUTABLE",
        message: "This certificate was generated by Medcal; its PDF cannot be replaced by an upload",
      });
    }
    if (existing?.status === "DRAFT") {
      throw new ConflictException({
        code: "CERTIFICATE_LEGACY_DRAFT_EXISTS",
        message:
          "This job already has a legacy draft certificate record; its historical number is not changed by uploads. Legacy records must be corrected through a separate process.",
      });
    }
    if (existing && existing.status !== "ISSUED") {
      throw new ConflictException({
        code: "CERTIFICATE_NOT_REPLACEABLE",
        message: `A ${existing.status} certificate cannot receive a new upload`,
      });
    }

    if (!existing) {
      return this.createIssuedUpload(companyId, job, userId, role, file, certificateNumber, ctx);
    }
    return this.replaceIssuedUpload(companyId, existing, userId, role, file, certificateNumber, ctx);
  }

  private async createIssuedUpload(
    companyId: string,
    job: Awaited<ReturnType<CertificateService["requireJob"]>>,
    userId: string,
    role: MembershipRole,
    file: UploadedFile | undefined,
    certificateNumber: unknown,
    ctx: CertificateRequestContext,
  ): Promise<CertificateDetail> {
    const number = normalizeExternalCertificateNumber(certificateNumber);

    // Certificate.deviceId is NOT NULL: a purely technical precondition.
    if (!job.deviceId) {
      throw new ConflictException({
        code: "CERTIFICATE_DEVICE_NOT_RESOLVED",
        message:
          "Cannot attach a certificate before this job's device identity is resolved (deviceId is not set)",
      });
    }
    await this.assertNumberFree(companyId, number);

    let created: CertificateRow;
    try {
      created = await prisma.$transaction(async (tx) => {
        const row = await tx.certificate.create({
          data: {
            companyId,
            customerId: job.workOrder.customerId,
            deviceId: job.deviceId as string,
            calibrationJobId: job.id,
            number,
            source: "UPLOADED",
            status: "ISSUED",
            issuedAt: new Date(),
            verificationToken: generateVerificationToken(),
            createdByUserId: userId,
          },
        });
        await recordAuditLog(
          {
            companyId,
            userId,
            action: CERTIFICATE_ACTIONS.ISSUED,
            outcome: "SUCCESS",
            targetType: "Certificate",
            targetId: row.id,
            metadata: {
              certificateId: row.id,
              certificateNumber: row.number,
              source: row.source,
              calibrationJobId: job.id,
            },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          tx,
        );
        return row;
      });
    } catch (err) {
      const target = uniqueViolationTarget(err);
      if (target?.includes("number")) throw NUMBER_DUPLICATE();
      if (target?.includes("calibrationJobId")) {
        throw new ConflictException({
          code: "CERTIFICATE_ALREADY_EXISTS",
          message: "A certificate was just created for this job by another request; retry to replace its PDF",
        });
      }
      throw err;
    }

    let fileObject;
    try {
      fileObject = await this.files.upload({
        companyId,
        userId,
        role,
        ownerType: CERTIFICATE_OWNER_TYPE,
        ownerId: created.id,
        file,
      });
    } catch (err) {
      // The certificate was established by THIS request and has no PDF yet:
      // remove it so no ISSUED certificate without a document is left behind.
      await prisma.certificate
        .deleteMany({ where: { id: created.id, pdfFileObjectId: null } })
        .catch(() => undefined);
      await recordAuditLog({
        companyId,
        userId,
        action: CERTIFICATE_ACTIONS.UPLOADED,
        outcome: "FAILURE",
        targetType: "Certificate",
        targetId: created.id,
        metadata: { calibrationJobId: job.id, certificateNumber: number, rolledBack: true },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      }).catch(() => undefined);
      throw err;
    }

    let updated: CertificateRow;
    try {
      updated = await prisma.certificate.update({
        where: { id: created.id },
        data: { pdfFileObjectId: fileObject.id, updatedByUserId: userId },
      });
    } catch (err) {
      // The file exists but could not be attached: never leave an ISSUED
      // certificate without a PDF. Drop the row this request created and the
      // file it just stored.
      await prisma.certificate
        .deleteMany({ where: { id: created.id, pdfFileObjectId: null } })
        .catch(() => undefined);
      await this.files.discardUnreferenced(companyId, fileObject.id);
      await recordAuditLog({
        companyId,
        userId,
        action: CERTIFICATE_ACTIONS.UPLOADED,
        outcome: "FAILURE",
        targetType: "Certificate",
        targetId: created.id,
        metadata: { calibrationJobId: job.id, certificateNumber: number, rolledBack: true, stage: "attach" },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      }).catch(() => undefined);
      throw err;
    }
    await this.auditUpload(companyId, userId, updated, fileObject, false, ctx);
    return this.toDetail(companyId, updated);
  }

  private async replaceIssuedUpload(
    companyId: string,
    existing: CertificateRow,
    userId: string,
    role: MembershipRole,
    file: UploadedFile | undefined,
    certificateNumber: unknown,
    ctx: CertificateRequestContext,
  ): Promise<CertificateDetail> {
    // The number is part of the immutable certificate identity.
    if (certificateNumber !== undefined && certificateNumber !== null && `${certificateNumber}`.trim() !== "") {
      const provided = normalizeExternalCertificateNumber(certificateNumber);
      if (provided !== existing.number) {
        throw new ConflictException({
          code: "CERTIFICATE_NUMBER_IMMUTABLE",
          message: "The number of an issued certificate cannot be changed",
        });
      }
    }

    // Identity is the file's own bytes (sha256), never the filename — a
    // re-upload of the exact same PDF as the current version is a no-op
    // mistake, not a real replacement, so it's refused rather than silently
    // creating a redundant version. Only compared against the CURRENT
    // version: deliberately re-uploading an older, already-superseded
    // version is a legitimate action, not a duplicate-upload mistake.
    if (file?.buffer && existing.pdfFileObjectId) {
      const incomingChecksum = createHash("sha256").update(file.buffer).digest("hex");
      const current = await prisma.fileObject.findUnique({
        where: { id: existing.pdfFileObjectId },
        select: { checksum: true },
      });
      if (current?.checksum && current.checksum === incomingChecksum) {
        throw new ConflictException({
          code: "CERTIFICATE_DUPLICATE_FILE",
          message: "This file is identical to the current certificate version — no new version was created",
        });
      }
    }

    const isReplace = existing.pdfFileObjectId !== null;
    const fileObject = await this.files.upload({
      companyId,
      userId,
      role,
      ownerType: CERTIFICATE_OWNER_TYPE,
      ownerId: existing.id,
      file,
    });
    let updated: CertificateRow;
    try {
      updated = await prisma.certificate.update({
        where: { id: existing.id },
        data: { pdfFileObjectId: fileObject.id, updatedByUserId: userId },
      });
    } catch (err) {
      // The certificate keeps its current PDF; do not leave the new file behind as an orphan version.
      await this.files.discardUnreferenced(companyId, fileObject.id);
      throw err;
    }
    await this.auditUpload(companyId, userId, updated, fileObject, isReplace, ctx);
    return this.toDetail(companyId, updated);
  }

  private async auditUpload(
    companyId: string,
    userId: string,
    certificate: CertificateRow,
    fileObject: { id: string; originalName: string | null },
    isReplace: boolean,
    ctx: CertificateRequestContext,
  ) {
    await recordAuditLog({
      companyId,
      userId,
      action: isReplace ? CERTIFICATE_ACTIONS.REPLACED : CERTIFICATE_ACTIONS.UPLOADED,
      outcome: "SUCCESS",
      targetType: "Certificate",
      targetId: certificate.id,
      metadata: {
        calibrationJobId: certificate.calibrationJobId,
        certificateNumber: certificate.number,
        fileObjectId: fileObject.id,
        originalName: fileObject.originalName,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * ISSUE a Medcal-generated certificate (source = GENERATED) for a job.
   *
   * The Certificate row does not exist before this call and no number is
   * reserved earlier. In ONE transaction: allocate CRT/YYYY/MM/NNNNN (Asia/
   * Jakarta year+month, dedicated CERTIFICATE_GENERATED counter, collision
   * backstop), generate the verificationToken, create the row ISSUED, write
   * CERTIFICATE_ISSUED. After commit — never while the numbering lock is held —
   * the PDF is rendered from the persisted row and attached.
   *
   * If rendering fails the certificate stays ISSUED (its number is already
   * official) with no PDF; the failure is audited and this same call is
   * idempotent: calling it again re-renders the missing PDF instead of
   * issuing a second certificate.
   */
  async issueGenerated(
    companyId: string,
    calibrationJobId: string,
    userId: string,
    role: MembershipRole,
    ctx: CertificateRequestContext,
  ): Promise<CertificateDetail> {
    const job = await this.requireJob(companyId, calibrationJobId);

    const existing = await prisma.certificate.findUnique({ where: { calibrationJobId } });
    if (existing) {
      if (existing.source === "GENERATED" && existing.pdfFileObjectId === null) {
        await this.renderAndAttachPdf(companyId, existing, userId, role, ctx);
        const refreshed = await prisma.certificate.findUniqueOrThrow({ where: { id: existing.id } });
        return this.toDetail(companyId, refreshed);
      }
      throw new ConflictException({
        code: "CERTIFICATE_ALREADY_EXISTS",
        message: "A certificate already exists for this calibration job",
      });
    }

    if (!job.deviceId) {
      throw new ConflictException({
        code: "CERTIFICATE_DEVICE_NOT_RESOLVED",
        message:
          "Cannot issue a certificate before this job's device identity is resolved (deviceId is not set)",
      });
    }
    if (job.status !== "ACCEPTED_BY_QA") {
      throw new ConflictException({
        code: "CERTIFICATE_JOB_NOT_ACCEPTED",
        message: "A certificate can only be issued for a calibration job accepted by QA",
      });
    }
    // Fail before allocating anything: the QR/PDF cannot be produced without it.
    if (!buildVerificationUrl("x")) {
      throw new InternalServerErrorException({
        code: "CERTIFICATE_VERIFICATION_ORIGIN_NOT_CONFIGURED",
        message: "The customer portal URL (NEXT_PUBLIC_CUSTOMER_PORTAL_URL) is not configured",
      });
    }

    let issued: CertificateRow;
    try {
      issued = await prisma.$transaction(async (tx) => {
        const issuedAt = new Date();
        const number = await DocumentNumberService.allocate({
          companyId,
          documentType: "CERTIFICATE_GENERATED",
          issuedAt,
          timeZone: BUSINESS_TIME_ZONE,
          skipExisting: true,
          tx,
        });
        const approvedReview = await tx.qualityReview.findFirst({
          where: { calibrationJobId, status: "APPROVED" },
          orderBy: { reviewedAt: "desc" },
          select: { id: true },
        });
        const row = await tx.certificate.create({
          data: {
            companyId,
            customerId: job.workOrder.customerId,
            deviceId: job.deviceId as string,
            calibrationJobId,
            qualityReviewId: approvedReview?.id ?? null,
            number,
            source: "GENERATED",
            status: "ISSUED",
            issuedAt,
            verificationToken: generateVerificationToken(),
            createdByUserId: userId,
          },
        });
        await recordAuditLog(
          {
            companyId,
            userId,
            action: CERTIFICATE_ACTIONS.ISSUED,
            outcome: "SUCCESS",
            targetType: "Certificate",
            targetId: row.id,
            metadata: {
              certificateId: row.id,
              certificateNumber: row.number,
              source: row.source,
              calibrationJobId,
            },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          tx,
        );
        return row;
      });
    } catch (err) {
      if (err instanceof DocumentNumberSequenceExhaustedError) {
        throw new ConflictException({
          code: "CERTIFICATE_NUMBER_SEQUENCE_EXHAUSTED",
          message: `The certificate number sequence for ${err.year} is exhausted; nothing was issued`,
        });
      }
      if (err instanceof DocumentNumberCollisionError) {
        throw new ConflictException({
          code: "CERTIFICATE_NUMBER_ALLOCATION_FAILED",
          message: "Could not allocate a free certificate number; nothing was issued",
        });
      }
      const target = uniqueViolationTarget(err);
      if (target?.includes("calibrationJobId")) {
        throw new ConflictException({
          code: "CERTIFICATE_ALREADY_EXISTS",
          message: "A certificate already exists for this calibration job",
        });
      }
      if (target?.includes("number")) {
        throw new ConflictException({
          code: "CERTIFICATE_NUMBER_ALLOCATION_FAILED",
          message: "Could not allocate a free certificate number; nothing was issued",
        });
      }
      throw err;
    }

    await this.renderAndAttachPdf(companyId, issued, userId, role, ctx);
    const refreshed = await prisma.certificate.findUniqueOrThrow({ where: { id: issued.id } });
    return this.toDetail(companyId, refreshed);
  }

  private async renderAndAttachPdf(
    companyId: string,
    certificate: CertificateRow,
    userId: string,
    role: MembershipRole,
    ctx: CertificateRequestContext,
  ): Promise<void> {
    let storedFileId: string | null = null;
    let attachedOk = false;
    try {
      const verificationUrl = certificate.verificationToken
        ? buildVerificationUrl(certificate.verificationToken)
        : null;
      if (!verificationUrl || !certificate.issuedAt) {
        throw new Error("Certificate has no verification URL or issuedAt");
      }
      const [company, customer, device] = await Promise.all([
        prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
        prisma.customer.findUniqueOrThrow({ where: { id: certificate.customerId }, select: { name: true } }),
        prisma.device.findUniqueOrThrow({
          where: { id: certificate.deviceId },
          select: {
            code: true,
            brand: true,
            model: true,
            serialNumber: true,
            deviceType: { select: { name: true } },
          },
        }),
      ]);

      const buffer = await renderGeneratedCertificatePdf({
        number: certificate.number,
        issuedAt: certificate.issuedAt,
        validUntil: certificate.validUntil,
        companyName: company.name,
        customerName: customer.name,
        device: {
          name: device.deviceType.name,
          brand: device.brand,
          model: device.model,
          serialNumber: device.serialNumber,
          code: device.code,
        },
        verificationUrl,
      });

      const fileObject = await this.files.upload({
        companyId,
        userId,
        role,
        ownerType: CERTIFICATE_OWNER_TYPE,
        ownerId: certificate.id,
        file: {
          originalname: generatedCertificateFilename(certificate.number),
          mimetype: "application/pdf",
          size: buffer.length,
          buffer,
        },
      });

      storedFileId = fileObject.id;
      // Guarded so a concurrent retry cannot replace an already-attached PDF.
      const attached = await prisma.certificate.updateMany({
        where: { id: certificate.id, pdfFileObjectId: null },
        data: { pdfFileObjectId: fileObject.id, updatedByUserId: userId },
      });
      if (attached.count !== 1) {
        throw new Error("A PDF was attached to this certificate concurrently");
      }
      attachedOk = true;
      await recordAuditLog({
        companyId,
        userId,
        action: CERTIFICATE_ACTIONS.PDF_GENERATED,
        outcome: "SUCCESS",
        targetType: "Certificate",
        targetId: certificate.id,
        metadata: {
          certificateId: certificate.id,
          certificateNumber: certificate.number,
          source: certificate.source,
          calibrationJobId: certificate.calibrationJobId,
          fileObjectId: fileObject.id,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    } catch (err) {
      if (storedFileId && !attachedOk) {
        await this.files.discardUnreferenced(companyId, storedFileId);
      }
      await recordAuditLog({
        companyId,
        userId,
        action: CERTIFICATE_ACTIONS.PDF_GENERATION_FAILED,
        outcome: "FAILURE",
        targetType: "Certificate",
        targetId: certificate.id,
        metadata: {
          certificateId: certificate.id,
          certificateNumber: certificate.number,
          calibrationJobId: certificate.calibrationJobId,
          reason: err instanceof Error ? err.message : "unknown",
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      }).catch(() => undefined);
      throw new InternalServerErrorException({
        code: "CERTIFICATE_PDF_GENERATION_FAILED",
        message: `Certificate ${certificate.number} was issued but its PDF could not be generated; repeat the issue request to regenerate it`,
      });
    }
  }

  private async requireOwnedVersion(companyId: string, certificateId: string, fileId: string) {
    const fileObject = await prisma.fileObject.findFirst({
      where: { id: fileId, companyId, ownerType: CERTIFICATE_OWNER_TYPE, ownerId: certificateId },
      select: { id: true },
    });
    if (!fileObject) {
      throw new NotFoundException({
        code: "CERTIFICATE_FILE_NOT_FOUND",
        message: "File not found for this certificate",
      });
    }
  }

  async downloadVersion(
    companyId: string,
    calibrationJobId: string,
    fileId: string,
    role: MembershipRole,
    userId: string,
    ctx: CertificateRequestContext,
  ) {
    const certificate = await this.requireCertificateForJob(companyId, calibrationJobId);
    // Re-derives ownership from the certificate this job actually owns — a
    // fileId from a different job's certificate 404s here, never leaks.
    await this.requireOwnedVersion(companyId, certificate.id, fileId);
    const result = await this.files.getForDownload(companyId, fileId, role);

    await recordAuditLog({
      companyId,
      userId,
      action: CERTIFICATE_ACTIONS.DOWNLOADED,
      outcome: "SUCCESS",
      targetType: "Certificate",
      targetId: certificate.id,
      metadata: { calibrationJobId, fileObjectId: fileId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return result;
  }

  async deleteVersion(
    companyId: string,
    calibrationJobId: string,
    fileId: string,
    role: MembershipRole,
    userId: string,
    ctx: CertificateRequestContext,
  ): Promise<{ id: string; deleted: boolean }> {
    const certificate = await this.requireCertificateForJob(companyId, calibrationJobId);
    await this.requireOwnedVersion(companyId, certificate.id, fileId);
    // Certificate.pdfFileObjectId is an OPTIONAL FK (ON DELETE SET NULL, not
    // RESTRICT) — the database would silently null it out rather than refuse,
    // so this check is enforced here, in application code, not left to a
    // constraint. A certificate must always have an active document; deleting
    // the current version requires uploading a replacement first.
    if (certificate.pdfFileObjectId === fileId) {
      throw new ConflictException({
        code: "CERTIFICATE_CURRENT_VERSION_LOCKED",
        message: "This is the current certificate version — upload a replacement before deleting it",
      });
    }
    const result = await this.files.delete(companyId, fileId, role);

    await recordAuditLog({
      companyId,
      userId,
      action: CERTIFICATE_ACTIONS.DELETED,
      outcome: "SUCCESS",
      targetType: "Certificate",
      targetId: certificate.id,
      metadata: { calibrationJobId, fileObjectId: fileId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return result;
  }
}
