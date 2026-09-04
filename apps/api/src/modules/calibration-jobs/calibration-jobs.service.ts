import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import type { AkdAklApprovalStatus } from "@medcal/db";
import {
  CALIBRATION_JOB_SORTABLE_FIELDS,
  type CalibrationJobEscalateIdentityInput,
  type CalibrationJobIdentityDecisionInput,
  type CalibrationJobListQuery,
  type IdentityCorrectionDecisionInput,
  type IdentityCorrectionSubmitInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";
import { DevicesService, type DeviceWithRelations } from "../devices/devices.service";

const calibrationJobInclude = {
  workOrder: { select: { id: true, number: true, status: true, customerId: true } },
  device: {
    select: { id: true, code: true, serialNumber: true, deviceTypeId: true, customerId: true },
  },
  calibrationRequestItem: {
    select: {
      id: true,
      customerDeviceName: true,
      akdAkl: true,
      deviceTypeId: true,
      deviceType: { select: { id: true, code: true, name: true } },
    },
  },
  purchaseOrderItem: {
    select: {
      quotationItem: {
        select: {
          requestItem: {
            select: {
              deviceTypeId: true,
              deviceType: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  },
  akdAklApprovedBy: { select: { id: true, name: true } },
} as const;

export type CalibrationJobDetail = Prisma.CalibrationJobGetPayload<{
  include: typeof calibrationJobInclude;
}>;

const identityCorrectionInclude = {
  submittedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
  prevDevice: { select: { id: true, code: true, serialNumber: true } },
  newDevice: { select: { id: true, code: true, serialNumber: true } },
  signatures: true,
} as const;

type IdentityCorrectionRow = Prisma.IdentityCorrectionGetPayload<{
  include: typeof identityCorrectionInclude;
}>;

type IdentityCorrectionSignatureRow = IdentityCorrectionRow["signatures"][number];

export interface IdentityCorrectionSignatureFile {
  id: string;
  originalName: string | null;
  mimeType: string | null;
}

export type IdentityCorrectionSignatureWithFiles = IdentityCorrectionSignatureRow & {
  /**
   * Signature images, resolved via the polymorphic FileObject relation
   * (ownerType = IDENTITY_CORRECTION, ownerId = signature id) — the
   * IdentityCorrectionSignature.fileObjectId column is intentionally unused.
   */
  files: IdentityCorrectionSignatureFile[];
};

export type IdentityCorrectionDetail = Omit<IdentityCorrectionRow, "signatures"> & {
  signatures: IdentityCorrectionSignatureWithFiles[];
};

/**
 * Allowed transitions for CalibrationJob.akdAklApprovalStatus (the per-device
 * AKD/AKL/NIE regulatory gate). Mirrors the ALLOWED_TRANSITIONS pattern used
 * for WorkOrder status in work-orders.service.ts.
 *
 * - NOT_REQUIRED → PENDING_REVIEW: a technician escalates a missing declaration.
 * - PENDING_REVIEW → APPROVED / REJECTED: the TECHNICIAN_MANAGER decides.
 * - REJECTED → PENDING_REVIEW: re-escalation (e.g. the customer later supplies
 *   the AKL).
 * - APPROVED → PENDING_REVIEW: an APPROVED Identity Correction BA that changed
 *   the AKD/AKL value reopens the gate (guarded in decideIdentityCorrection, not
 *   reachable from escalateIdentity — that still asserts the transition).
 */
const AKD_AKL_TRANSITIONS: Record<AkdAklApprovalStatus, readonly AkdAklApprovalStatus[]> = {
  NOT_REQUIRED: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PENDING_REVIEW"],
  REJECTED: ["PENDING_REVIEW"],
};

// Once execution has advanced past the bench, the identity gate is moot.
const IDENTITY_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);

function assertAkdAklTransition(from: AkdAklApprovalStatus, to: AkdAklApprovalStatus): void {
  if (!AKD_AKL_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException({
      message: `Cannot move AKD/AKL approval from ${from} to ${to}`,
      code: "INVALID_AKD_AKL_TRANSITION",
      from,
      to,
    });
  }
}

export interface CalibrationJobListResult {
  data: CalibrationJobDetail[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;

export interface IdentityCorrectionSubmitResult {
  job: CalibrationJobDetail;
  correction: IdentityCorrectionDetail;
  /**
   * True when the (new) device's deviceTypeId was checked against the job's
   * resolved DeviceType. False only when the job's DeviceType could not be
   * resolved — the correction still records the device, just unvalidated.
   */
  deviceTypeValidated: boolean;
}

@Injectable()
export class CalibrationJobsService {
  private readonly devices = new DevicesService();

  /** Portal management list. Company-scoped; filters mirror the WorkOrder list. */
  async findAll(
    companyId: string,
    query: CalibrationJobListQuery,
    userId: string,
  ): Promise<CalibrationJobListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CalibrationJobWhereInput = {
      companyId,
      ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
      ...(query.akdAklApprovalStatus ? { akdAklApprovalStatus: query.akdAklApprovalStatus } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToMe
        ? { workOrder: { assignments: { some: { technicianUserId: userId } } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { customerDeclaredDeviceName: { contains: query.search, mode: "insensitive" } },
              { technicianObservedSerial: { contains: query.search, mode: "insensitive" } },
              { workOrder: { number: { contains: query.search, mode: "insensitive" } } },
              { device: { serialNumber: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      CALIBRATION_JOB_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.calibrationJob.count({ where }),
      prisma.calibrationJob.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: calibrationJobInclude,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<CalibrationJobDetail> {
    const job = await prisma.calibrationJob.findFirst({
      where: { id, companyId },
      include: calibrationJobInclude,
    });
    if (!job) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    return job;
  }

  /** Technician (or their manager) raises the AKD/AKL/NIE gate for one device. */
  async escalateIdentity(
    companyId: string,
    id: string,
    input: CalibrationJobEscalateIdentityInput,
  ): Promise<CalibrationJobDetail> {
    const existing = await this.findOne(companyId, id);
    this.assertIdentityGateOpen(existing.status);
    if (existing.akdAklApprovalStatus === "APPROVED") {
      // An APPROVED gate only reopens via an Identity Correction BA, never a
      // bare re-escalation.
      throw new BadRequestException({
        message: "Cannot move AKD/AKL approval from APPROVED to PENDING_REVIEW",
        code: "INVALID_AKD_AKL_TRANSITION",
        from: "APPROVED",
        to: "PENDING_REVIEW",
      });
    }
    assertAkdAklTransition(existing.akdAklApprovalStatus, "PENDING_REVIEW");

    await prisma.calibrationJob.update({
      where: { id },
      data: {
        akdAklApprovalStatus: "PENDING_REVIEW",
        ...(input.technicianObservedAkdAkl !== undefined
          ? { technicianObservedAkdAkl: input.technicianObservedAkdAkl }
          : {}),
        // v1: escalation reason rides on the decision-note column and is later
        // overwritten by the manager's rationale. Known gap — a dedicated
        // akdAklEscalationNote / audit-log is a future schema task.
        akdAklDecisionNote: input.reason ?? null,
        // Clear any stale approver stamp from a prior REJECTED decision.
        akdAklApprovedByUserId: null,
        akdAklApprovedAt: null,
      },
    });

    return this.findOne(companyId, id);
  }

  /** TECHNICIAN_MANAGER APPROVE/REJECT decision for one device. */
  async decideIdentity(
    companyId: string,
    id: string,
    userId: string,
    input: CalibrationJobIdentityDecisionInput,
  ): Promise<CalibrationJobDetail> {
    const existing = await this.findOne(companyId, id);
    this.assertIdentityGateOpen(existing.status);

    const target: AkdAklApprovalStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    if (existing.akdAklApprovalStatus !== "PENDING_REVIEW") {
      throw new BadRequestException({
        message: `Cannot move AKD/AKL approval from ${existing.akdAklApprovalStatus} to ${target}`,
        code: "INVALID_AKD_AKL_TRANSITION",
        from: existing.akdAklApprovalStatus,
        to: target,
      });
    }

    await prisma.calibrationJob.update({
      where: { id },
      data: {
        akdAklApprovalStatus: target,
        akdAklApprovedByUserId: userId,
        akdAklApprovedAt: new Date(),
        ...(input.akdAklDecisionNote !== undefined
          ? { akdAklDecisionNote: input.akdAklDecisionNote }
          : {}),
      },
    });

    return this.findOne(companyId, id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Physical device identity — resolution helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * The DeviceType this job's device is expected to be, resolved from the
   * commercial chain. Prefers the direct link (calibrationRequestItem), falls
   * back to the PO-item walk, and returns null when neither resolves.
   */
  private resolveJobDeviceTypeId(job: CalibrationJobDetail): string | null {
    return (
      job.calibrationRequestItem?.deviceTypeId ??
      job.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
      null
    );
  }

  /**
   * Customer-match + DeviceType-match validation for a candidate device. Shared
   * by Identity Correction submit and approve (the former match-only
   * assignDevice path is removed). Returns whether the DeviceType could be
   * checked at all.
   */
  private async validateDeviceForJob(
    job: CalibrationJobDetail,
    deviceId: string,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<{ deviceTypeValidated: boolean }> {
    const device = await client.device.findFirst({
      where: { id: deviceId, companyId: job.companyId },
      select: { id: true, customerId: true, deviceTypeId: true },
    });
    if (!device) {
      throw new BadRequestException({ message: "Device not found", code: "DEVICE_NOT_FOUND" });
    }
    if (device.customerId !== job.workOrder.customerId) {
      throw new BadRequestException({
        message: "Device belongs to a different customer than this work order",
        code: "DEVICE_CUSTOMER_MISMATCH",
      });
    }
    const resolvedDeviceTypeId = this.resolveJobDeviceTypeId(job);
    const deviceTypeValidated = resolvedDeviceTypeId !== null;
    if (deviceTypeValidated && device.deviceTypeId !== resolvedDeviceTypeId) {
      throw new BadRequestException({
        message: "Device type does not match the calibration job's device type",
        code: "DEVICE_TYPE_MISMATCH",
        expected: resolvedDeviceTypeId,
        actual: device.deviceTypeId,
      });
    }
    return { deviceTypeValidated };
  }

  private async bindDevice(
    jobId: string,
    deviceId: string,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<void> {
    try {
      await client.calibrationJob.update({
        where: { id: jobId },
        data: { deviceId },
      });
    } catch (error) {
      // @@unique([workOrderId, deviceId]) — the same physical device is already
      // matched to another job on this work order.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          message: "This device is already assigned to another job on the same work order",
          code: "DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER",
        });
      }
      throw error;
    }
  }

  /**
   * The former POST /calibration-jobs/:id/assign-device path. Removed — every
   * device-identity binding now flows through the Identity Correction BA
   * workflow. Kept as an inert 410 so an un-migrated Portal build fails loudly
   * rather than silently.
   */
  assignDeviceRemoved(): never {
    throw new GoneException({
      message:
        "The assign-device endpoint has been removed. Submit an Identity Correction BA instead " +
        "(POST /calibration-jobs/:id/identity-corrections).",
      code: "ASSIGN_DEVICE_ENDPOINT_REMOVED",
    });
  }

  /** Existing devices this job could be matched to — scoped to the job's customer
   * and (when resolvable) DeviceType. Reuses the generic device search. */
  async findDeviceCandidates(
    companyId: string,
    id: string,
    search: string | undefined,
  ): Promise<DeviceWithRelations[]> {
    const job = await this.findOne(companyId, id);
    const deviceTypeId = this.resolveJobDeviceTypeId(job);
    const result = await this.devices.findAll(companyId, {
      ...(search ? { search } : {}),
      customerId: job.workOrder.customerId,
      ...(deviceTypeId ? { deviceTypeId } : {}),
      status: "ACTIVE",
      pageSize: 20,
    });
    return result.data;
  }

  private assertIdentityGateOpen(jobStatus: string): void {
    if (IDENTITY_LOCKED_JOB_STATUSES.has(jobStatus)) {
      throw new BadRequestException({
        message: "Calibration job has advanced past the identity gate",
        code: "CALIBRATION_JOB_IDENTITY_GATE_LOCKED",
        status: jobStatus,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Identity Correction — Berita Acara Identitas
  // ───────────────────────────────────────────────────────────────────────────

  async listIdentityCorrections(
    companyId: string,
    jobId: string,
  ): Promise<IdentityCorrectionDetail[]> {
    await this.findOne(companyId, jobId);
    const rows = await prisma.identityCorrection.findMany({
      where: { companyId, calibrationJobId: jobId },
      orderBy: { createdAt: "desc" },
      include: identityCorrectionInclude,
    });
    return Promise.all(rows.map((row) => this.attachSignatureFiles(companyId, row)));
  }

  async getIdentityCorrection(
    companyId: string,
    jobId: string,
    correctionId: string,
  ): Promise<IdentityCorrectionDetail> {
    const row = await prisma.identityCorrection.findFirst({
      where: { id: correctionId, companyId, calibrationJobId: jobId },
      include: identityCorrectionInclude,
    });
    if (!row) {
      throw new NotFoundException({
        message: "Identity correction not found",
        code: "IDENTITY_CORRECTION_NOT_FOUND",
      });
    }
    return this.attachSignatureFiles(companyId, row);
  }

  private async attachSignatureFiles(
    companyId: string,
    row: IdentityCorrectionRow,
  ): Promise<IdentityCorrectionDetail> {
    const signatureIds = row.signatures.map((s) => s.id);
    const files = signatureIds.length
      ? await prisma.fileObject.findMany({
          where: { companyId, ownerType: "IDENTITY_CORRECTION", ownerId: { in: signatureIds } },
          select: { id: true, ownerId: true, originalName: true, mimeType: true },
        })
      : [];
    return {
      ...row,
      signatures: row.signatures.map((signature) => ({
        ...signature,
        files: files
          .filter((f) => f.ownerId === signature.id)
          .map((f) => ({ id: f.id, originalName: f.originalName, mimeType: f.mimeType })),
      })),
    };
  }

  /**
   * Submit an Identity Correction BA. Creates the IdentityCorrection row +
   * exactly one IdentityCorrectionSignature per role, atomically, at status
   * PENDING_REVIEW. Signature images are uploaded afterwards via POST /files.
   */
  async submitIdentityCorrection(
    companyId: string,
    jobId: string,
    userId: string,
    input: IdentityCorrectionSubmitInput,
  ): Promise<IdentityCorrectionSubmitResult> {
    const job = await this.findOne(companyId, jobId);
    this.assertIdentityGateOpen(job.status);

    const existingPending = await prisma.identityCorrection.findFirst({
      where: { companyId, calibrationJobId: jobId, status: "PENDING_REVIEW" },
      select: { id: true, number: true },
    });
    if (existingPending) {
      throw new ConflictException({
        message: "This job already has an Identity Correction awaiting review",
        code: "IDENTITY_CORRECTION_ALREADY_PENDING",
        correctionId: existingPending.id,
        number: existingPending.number,
      });
    }

    // Decision 2: a BA is only created when at least one observed value differs
    // from what is currently on the job. A first-time device resolution
    // (job.deviceId null → newDeviceId set) inherently differs.
    const deviceChanges =
      input.newDeviceId !== undefined && (input.newDeviceId ?? null) !== job.deviceId;
    const serialChanges =
      input.newSerial !== undefined &&
      (input.newSerial ?? null) !== job.technicianObservedSerial;
    const akdAklChanges =
      input.newAkdAkl !== undefined &&
      (input.newAkdAkl ?? null) !== job.technicianObservedAkdAkl;

    if (!deviceChanges && !serialChanges && !akdAklChanges) {
      throw new BadRequestException({
        message: "The correction does not change any of the job's current identity values",
        code: "IDENTITY_CORRECTION_NO_CHANGE",
      });
    }

    let deviceTypeValidated = false;
    if (deviceChanges && input.newDeviceId) {
      ({ deviceTypeValidated } = await this.validateDeviceForJob(job, input.newDeviceId));
    }

    const issuedAt = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const number = await DocumentNumberService.allocate({
        companyId,
        documentType: "IDENTITY_CORRECTION_BA",
        issuedAt,
        tx,
      });

      const correction = await tx.identityCorrection.create({
        data: {
          companyId,
          calibrationJobId: jobId,
          number,
          status: "PENDING_REVIEW",
          reason: input.reason,
          submittedByUserId: userId,
          ...(deviceChanges
            ? { prevDeviceId: job.deviceId, newDeviceId: input.newDeviceId ?? null }
            : {}),
          ...(serialChanges
            ? {
                prevSerial: job.technicianObservedSerial,
                newSerial: input.newSerial ?? null,
              }
            : {}),
          ...(akdAklChanges
            ? {
                prevAkdAkl: job.technicianObservedAkdAkl,
                newAkdAkl: input.newAkdAkl ?? null,
              }
            : {}),
          signatures: {
            create: (["TECHNICIAN", "CUSTOMER"] as const).map((role) => {
              const sig = input.signatures[role];
              return {
                companyId,
                signerRole: role,
                status: sig.status,
                signerName: sig.signerName ?? null,
                unavailableReason: sig.unavailableReason ?? null,
                signedAt: sig.status === "SIGNED" ? issuedAt : null,
              };
            }),
          },
        },
        include: identityCorrectionInclude,
      });
      return correction;
    });

    return {
      job,
      correction: await this.attachSignatureFiles(companyId, created),
      deviceTypeValidated,
    };
  }

  /** TECHNICIAN_MANAGER APPROVE/REJECT of an Identity Correction BA. */
  async decideIdentityCorrection(
    companyId: string,
    jobId: string,
    correctionId: string,
    userId: string,
    input: IdentityCorrectionDecisionInput,
  ): Promise<{ job: CalibrationJobDetail; correction: IdentityCorrectionDetail }> {
    const job = await this.findOne(companyId, jobId);
    const correction = await prisma.identityCorrection.findFirst({
      where: { id: correctionId, companyId, calibrationJobId: jobId },
      include: { signatures: true },
    });
    if (!correction) {
      throw new NotFoundException({
        message: "Identity correction not found",
        code: "IDENTITY_CORRECTION_NOT_FOUND",
      });
    }
    if (correction.status !== "PENDING_REVIEW") {
      throw new BadRequestException({
        message: `Identity correction is already ${correction.status}`,
        code: "IDENTITY_CORRECTION_ALREADY_DECIDED",
        status: correction.status,
      });
    }
    this.assertIdentityGateOpen(job.status);

    const decidedAt = new Date();

    if (input.decision === "REJECT") {
      await prisma.identityCorrection.update({
        where: { id: correctionId },
        data: {
          status: "REJECTED",
          decidedByUserId: userId,
          decidedAt,
          decisionNote: input.decisionNote ?? null,
        },
      });
      return {
        job: await this.findOne(companyId, jobId),
        correction: await this.getIdentityCorrection(companyId, jobId, correctionId),
      };
    }

    // APPROVE — every SIGNED signature must have its image uploaded first.
    const signedIds = correction.signatures
      .filter((s) => s.status === "SIGNED")
      .map((s) => s.id);
    if (signedIds.length) {
      const withImages = await prisma.fileObject.findMany({
        where: { companyId, ownerType: "IDENTITY_CORRECTION", ownerId: { in: signedIds } },
        select: { ownerId: true },
      });
      const haveImage = new Set(withImages.map((f) => f.ownerId));
      const missing = signedIds.filter((id) => !haveImage.has(id));
      if (missing.length) {
        throw new BadRequestException({
          message: "A signature image is missing for a signer marked SIGNED",
          code: "IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING",
          signatureIds: missing,
        });
      }
    }

    if (correction.newDeviceId) {
      await this.validateDeviceForJob(job, correction.newDeviceId);
    }

    const reopenAkdAklGate =
      correction.newAkdAkl !== null && job.akdAklApprovalStatus === "APPROVED";
    if (reopenAkdAklGate) {
      assertAkdAklTransition("APPROVED", "PENDING_REVIEW");
    }

    await prisma.$transaction(async (tx) => {
      if (correction.newDeviceId) {
        await this.bindDevice(jobId, correction.newDeviceId, tx);
      }

      const jobData: Prisma.CalibrationJobUncheckedUpdateInput = {};
      if (correction.newSerial !== null) jobData.technicianObservedSerial = correction.newSerial;
      if (correction.newAkdAkl !== null) jobData.technicianObservedAkdAkl = correction.newAkdAkl;
      if (reopenAkdAklGate) {
        jobData.akdAklApprovalStatus = "PENDING_REVIEW";
        jobData.akdAklApprovedByUserId = null;
        jobData.akdAklApprovedAt = null;
      }
      if (Object.keys(jobData).length > 0) {
        await tx.calibrationJob.update({ where: { id: jobId }, data: jobData });
      }

      await tx.identityCorrection.update({
        where: { id: correctionId },
        data: {
          status: "APPROVED",
          decidedByUserId: userId,
          decidedAt,
          decisionNote: input.decisionNote ?? null,
          akdAklGateReopened: reopenAkdAklGate,
        },
      });
    });

    return {
      job: await this.findOne(companyId, jobId),
      correction: await this.getIdentityCorrection(companyId, jobId, correctionId),
    };
  }
}
