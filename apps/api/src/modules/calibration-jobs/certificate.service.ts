import { createHash } from "node:crypto";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentNumberService, prisma, type CertificateStatus, type MembershipRole } from "@medcal/db";
import { FilesService } from "../files/files.service";
import type { UploadedFile } from "../files/files.constants";
import { recordAuditLog } from "./audit-log";

const CERTIFICATE_OWNER_TYPE = "CERTIFICATE" as const;

export const CERTIFICATE_ACTIONS = {
  UPLOADED: "CERTIFICATE_UPLOADED",
  REPLACED: "CERTIFICATE_REPLACED",
  DOWNLOADED: "CERTIFICATE_DOWNLOADED",
  DELETED: "CERTIFICATE_DELETED",
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
  status: CertificateStatus;
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

/**
 * Certificate = a hardcopy calibration certificate scanned and uploaded as a
 * PDF, 1:1 with CalibrationJob (existing schema invariant — not redesigned
 * here). This service ONLY handles upload / retrieval / download / version
 * history / delete of that scanned document. It deliberately does not touch
 * QualityReview, does not gate on QA status, and does not implement a
 * "certificate issue/approval" workflow (out of scope — see the readiness
 * audit and the locked business rules for this task).
 *
 * Versioning: every upload creates a NEW FileObject (via the generic
 * FilesService) under the same Certificate.id as ownerId; the previous
 * FileObject is never deleted or overwritten — it simply stops being
 * "current" (Certificate.pdfFileObjectId now points elsewhere) while
 * remaining queryable as history via `versions`.
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
        workOrder: { select: { customerId: true } },
      },
    });
    if (!job) throw JOB_NOT_FOUND;
    return job;
  }

  private async toDetail(
    companyId: string,
    certificate: {
      id: string;
      calibrationJobId: string;
      number: string;
      status: CertificateStatus;
      pdfFileObjectId: string | null;
      createdByUserId: string | null;
      updatedByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): Promise<CertificateDetail> {
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
      status: certificate.status,
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
   * Create-if-absent. Certificate.customerId/deviceId are NOT NULL in the
   * existing schema, so a certificate cannot be created before the job's
   * device identity is resolved (deviceId set) — a purely technical
   * precondition, unrelated to QA. Certificate.number is also NOT NULL/
   * unique; it is allocated here via the existing DocumentNumberService
   * (CER prefix, already registered, previously unused) purely to satisfy
   * that constraint — this is numbering, not "issuing" a certificate.
   */
  private async ensureCertificate(companyId: string, calibrationJobId: string, userId: string) {
    const job = await this.requireJob(companyId, calibrationJobId);
    const existing = await prisma.certificate.findUnique({ where: { calibrationJobId } });
    if (existing) return existing;

    if (!job.deviceId) {
      throw new ConflictException({
        code: "CERTIFICATE_DEVICE_NOT_RESOLVED",
        message:
          "Cannot attach a certificate before this job's device identity is resolved (deviceId is not set)",
      });
    }
    const deviceId = job.deviceId;
    const customerId = job.workOrder.customerId;

    try {
      return await prisma.$transaction(async (tx) => {
        const number = await DocumentNumberService.allocate({
          companyId,
          documentType: "CERTIFICATE",
          issuedAt: new Date(),
          tx,
        });
        return tx.certificate.create({
          data: { companyId, customerId, deviceId, calibrationJobId, number, createdByUserId: userId },
        });
      });
    } catch (err) {
      // Unique-constraint race: a concurrent upload already created it.
      const raced = await prisma.certificate.findUnique({ where: { calibrationJobId } });
      if (raced) return raced;
      throw err;
    }
  }

  async uploadVersion(
    companyId: string,
    calibrationJobId: string,
    userId: string,
    role: MembershipRole,
    file: UploadedFile | undefined,
    ctx: CertificateRequestContext,
  ): Promise<CertificateDetail> {
    const certificate = await this.ensureCertificate(companyId, calibrationJobId, userId);
    const isReplace = certificate.pdfFileObjectId !== null;

    // Identity is the file's own bytes (sha256), never the filename — a
    // re-upload of the exact same PDF as the current version is a no-op
    // mistake, not a real replacement, so it's refused rather than silently
    // creating a redundant version. Only compared against the CURRENT
    // version: deliberately re-uploading an older, already-superseded
    // version is a legitimate action, not a duplicate-upload mistake.
    if (file?.buffer && certificate.pdfFileObjectId) {
      const incomingChecksum = createHash("sha256").update(file.buffer).digest("hex");
      const current = await prisma.fileObject.findUnique({
        where: { id: certificate.pdfFileObjectId },
        select: { checksum: true },
      });
      if (current?.checksum && current.checksum === incomingChecksum) {
        throw new ConflictException({
          code: "CERTIFICATE_DUPLICATE_FILE",
          message: "This file is identical to the current certificate version — no new version was created",
        });
      }
    }

    const fileObject = await this.files.upload({
      companyId,
      userId,
      role,
      ownerType: CERTIFICATE_OWNER_TYPE,
      ownerId: certificate.id,
      file,
    });

    const updated = await prisma.certificate.update({
      where: { id: certificate.id },
      data: { pdfFileObjectId: fileObject.id, updatedByUserId: userId },
    });

    await recordAuditLog({
      companyId,
      userId,
      action: isReplace ? CERTIFICATE_ACTIONS.REPLACED : CERTIFICATE_ACTIONS.UPLOADED,
      outcome: "SUCCESS",
      targetType: "Certificate",
      targetId: certificate.id,
      metadata: {
        calibrationJobId,
        fileObjectId: fileObject.id,
        originalName: fileObject.originalName,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.toDetail(companyId, updated);
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
