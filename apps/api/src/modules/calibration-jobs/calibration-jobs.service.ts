import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hasPermission } from "@medcal/auth";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import type { AkdAklApprovalStatus, MembershipRole } from "@medcal/db";
import {
  CALIBRATION_JOB_SORTABLE_FIELDS,
  jobNeedsAction,
  type CalibrationJobActionSignals,
  type CalibrationJobEscalateIdentityInput,
  type CalibrationJobIdentityDecisionInput,
  type CalibrationJobListQuery,
  type IdentityCorrectionDecisionInput,
  type IdentityCorrectionSubmitInput,
  type JobReferenceEquipmentReplaceInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";
import { DevicesService, type DeviceWithRelations } from "../devices/devices.service";
import {
  buildReferenceEquipmentCandidates,
  jobNeedsReferenceEquipmentReview,
  jobReferenceEquipmentReviewInclude,
  jobReferenceEquipmentSourceInclude,
  jobReferenceEquipmentUsedInclude,
  requiredEquipmentTypeIdsByDeviceType,
  reviewSourceDeviceTypeId,
  validateJobReferenceEquipmentSelection,
  type JobReferenceEquipmentCandidate,
  type JobReferenceEquipmentSource,
  type JobReferenceEquipmentUsedDetail,
} from "./job-reference-equipment";

const calibrationJobInclude = {
  workOrder: {
    select: {
      id: true,
      number: true,
      status: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
    },
  },
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
  // Most-recent Identity Correction BA (any status) — drives the portal list
  // badge and the Work Order item indicator. `take: 1` keeps the payload flat;
  // at most one PENDING_REVIEW can exist per job (enforced on submit).
  identityCorrections: {
    select: { id: true, number: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
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

export interface IdentityCorrectionSignatureFile {
  id: string;
  originalName: string | null;
  mimeType: string | null;
}

export type IdentityCorrectionDetail = IdentityCorrectionRow & {
  /**
   * Photo of the signed BA sheet — one per correction, resolved via the
   * polymorphic FileObject relation (ownerType = IDENTITY_CORRECTION,
   * ownerId = correction id). Both signatures live on the same physical
   * sheet, so the photo is not per-signer; the
   * IdentityCorrectionSignature.fileObjectId column is intentionally unused.
   */
  files: IdentityCorrectionSignatureFile[];
};

/**
 * Allowed transitions for CalibrationJob.akdAklApprovalStatus (the per-device
 * AKD/AKL/NIE regulatory gate). Mirrors the ALLOWED_TRANSITIONS pattern used
 * for WorkOrder status in work-orders.service.ts.
 *
 * - NOT_REQUIRED → PENDING_REVIEW: a technician escalates a missing declaration,
 *   OR an approved Identity Correction BA makes technicianObservedAkdAkl differ
 *   from customerDeclaredAkdAkl (auto, in decideIdentityCorrection — the locked
 *   Q2 decision).
 * - PENDING_REVIEW → APPROVED / REJECTED: the TECHNICIAN_MANAGER decides.
 * - REJECTED → PENDING_REVIEW: re-escalation (e.g. the customer later supplies
 *   the AKL).
 * - APPROVED → PENDING_REVIEW: an approved Identity Correction BA that leaves the
 *   observed AKD/AKL still mismatching the declaration reopens the gate (guarded
 *   in decideIdentityCorrection, not reachable from escalateIdentity — that still
 *   asserts the transition).
 *
 * PENDING_REVIEW → NOT_REQUIRED is not in the table: it happens only as a
 * system unwind in decideIdentityCorrection when a later correction resolves the
 * mismatch before a manager has decided, and is applied without going through
 * assertAkdAklTransition.
 */
const AKD_AKL_TRANSITIONS: Record<AkdAklApprovalStatus, readonly AkdAklApprovalStatus[]> = {
  NOT_REQUIRED: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PENDING_REVIEW"],
  REJECTED: ["PENDING_REVIEW"],
};

// Once execution has advanced past the bench, the identity gate is moot.
const IDENTITY_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);

// Same boundary as IDENTITY_LOCKED_JOB_STATUSES — once execution is past the
// bench, which reference equipment was used is also final.
const REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);

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

/**
 * Fields cleared whenever the system (not a manager decision) moves the AKD/AKL
 * gate — a stale approver stamp, decision note, or gate-origin marker must never
 * linger on the new status. Shared by both the mismatch-open and
 * mismatch-resolved paths in decideIdentityCorrection; the mismatch-open path
 * re-sets akdAklGateOpenedBy to AUTO_MISMATCH afterwards.
 */
const AKD_AKL_GATE_STAMP_RESET = {
  akdAklApprovedByUserId: null,
  akdAklApprovedAt: null,
  akdAklDecisionNote: null,
  akdAklGateOpenedBy: null,
} satisfies Prisma.CalibrationJobUncheckedUpdateInput;

/**
 * List row = the job detail payload plus computed state:
 *  - `needsReferenceEquipmentReview` drives the "Perlu Persetujuan Alat" badge on
 *    the Work Order items table (kept for that consumer).
 *  - `actionSignals` is the extensible per-job signal map (Identity Correction
 *    pending, Reference Equipment needs approval, …future phases) — the
 *    Calibration Jobs list groups by SPK and shows an aggregate count of child
 *    jobs with ≥1 signal. Both are computed state; see
 *    jobNeedsReferenceEquipmentReview and toListRow.
 */
export type CalibrationJobListRow = CalibrationJobDetail & {
  needsReferenceEquipmentReview: boolean;
  actionSignals: CalibrationJobActionSignals;
};

export interface CalibrationJobListResult {
  data: CalibrationJobListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** One SPK (WorkOrder) group in the grouped Calibration Jobs list. */
export interface CalibrationJobWorkOrderGroup {
  workOrder: CalibrationJobDetail["workOrder"];
  jobCount: number;
  /** Child jobs with ≥1 active action signal — computed server-side (jobNeedsAction). */
  actionNeededCount: number;
  jobs: CalibrationJobListRow[];
}

export interface CalibrationJobGroupedResult {
  data: CalibrationJobWorkOrderGroup[];
  /** Pagination is at the WorkOrder (parent) level — see the task report. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalJobs: number;
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

  private buildListWhere(
    companyId: string,
    query: CalibrationJobListQuery,
    userId: string,
  ): Prisma.CalibrationJobWhereInput {
    return {
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
  }

  /** Detail payload → list row: attach the computed reference-equipment flag + the action-signal map. */
  private toListRow(
    row: CalibrationJobDetail,
    reviewFlags: Map<string, boolean>,
  ): CalibrationJobListRow {
    const referenceEquipmentNeedsApproval = reviewFlags.get(row.id) ?? false;
    return {
      ...row,
      needsReferenceEquipmentReview: referenceEquipmentNeedsApproval,
      actionSignals: {
        identityCorrectionPending: row.identityCorrections[0]?.status === "PENDING_REVIEW",
        referenceEquipmentNeedsApproval,
      },
    };
  }

  /** Portal management list (flat). Company-scoped; filters mirror the WorkOrder list. */
  async findAll(
    companyId: string,
    query: CalibrationJobListQuery,
    userId: string,
  ): Promise<CalibrationJobListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.buildListWhere(companyId, query, userId);

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      CALIBRATION_JOB_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, rows] = await Promise.all([
      prisma.calibrationJob.count({ where }),
      prisma.calibrationJob.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: calibrationJobInclude,
      }),
    ]);

    const reviewFlags = await this.referenceEquipmentReviewFlags(rows.map((row) => row.id));
    const data = rows.map((row) => this.toListRow(row, reviewFlags));

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /**
   * Calibration Jobs list restructured as SPK (WorkOrder) groups — one parent
   * row per WorkOrder, its per-unit jobs as children. Pagination is at the
   * WorkOrder level: every matching job is fetched, grouped, then the groups are
   * sliced. Groups are ordered by their WorkOrder number (desc — newest SPK
   * first); jobs within a group by unitOrdinal. `actionNeededCount` per group is
   * the count of child jobs with ≥1 active action signal (jobNeedsAction).
   */
  async findAllGroupedByWorkOrder(
    companyId: string,
    query: CalibrationJobListQuery,
    userId: string,
  ): Promise<CalibrationJobGroupedResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.buildListWhere(companyId, query, userId);

    const rows = await prisma.calibrationJob.findMany({
      where,
      orderBy: [
        { workOrder: { number: "desc" } },
        { workOrderId: "desc" },
        { unitOrdinal: "asc" },
        { id: "asc" },
      ],
      include: calibrationJobInclude,
    });

    // Group in encounter order (already WO-number desc, unitOrdinal asc).
    const groupOrder: string[] = [];
    const byWorkOrder = new Map<string, CalibrationJobDetail[]>();
    for (const row of rows) {
      let bucket = byWorkOrder.get(row.workOrderId);
      if (!bucket) {
        bucket = [];
        byWorkOrder.set(row.workOrderId, bucket);
        groupOrder.push(row.workOrderId);
      }
      bucket.push(row);
    }

    const total = groupOrder.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pagedWorkOrderIds = groupOrder.slice(
      (page - 1) * pageSize,
      (page - 1) * pageSize + pageSize,
    );

    const pagedJobIds = pagedWorkOrderIds.flatMap((woId) =>
      (byWorkOrder.get(woId) ?? []).map((job) => job.id),
    );
    const reviewFlags = await this.referenceEquipmentReviewFlags(pagedJobIds);

    const data: CalibrationJobWorkOrderGroup[] = pagedWorkOrderIds.map((woId) => {
      const jobs = (byWorkOrder.get(woId) ?? []).map((job) => this.toListRow(job, reviewFlags));
      return {
        workOrder: jobs[0]!.workOrder,
        jobCount: jobs.length,
        actionNeededCount: jobs.filter((job) => jobNeedsAction(job.actionSignals)).length,
        jobs,
      };
    });

    return { data, page, pageSize, total, totalPages, totalJobs: rows.length };
  }

  /**
   * Batched "needs reference-equipment review" computation for a page of jobs.
   * One extra findMany (lightweight review shape) + one requirement lookup,
   * regardless of page size — the check itself reuses resolveJobEquipmentValidity.
   */
  private async referenceEquipmentReviewFlags(jobIds: string[]): Promise<Map<string, boolean>> {
    if (jobIds.length === 0) return new Map();

    const sources = await prisma.calibrationJob.findMany({
      where: { id: { in: jobIds } },
      include: jobReferenceEquipmentReviewInclude,
    });

    const requiredByDeviceType = await requiredEquipmentTypeIdsByDeviceType(
      sources
        .map(reviewSourceDeviceTypeId)
        .filter((deviceTypeId): deviceTypeId is string => deviceTypeId !== null),
    );

    const now = new Date();
    const flags = new Map<string, boolean>();
    for (const source of sources) {
      const deviceTypeId = reviewSourceDeviceTypeId(source);
      const requiredTypeIds = deviceTypeId
        ? (requiredByDeviceType.get(deviceTypeId) ?? new Set<string>())
        : null;
      flags.set(
        source.id,
        jobNeedsReferenceEquipmentReview(source, requiredTypeIds, source.startedAt ?? now),
      );
    }
    return flags;
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

  /** Detail endpoint payload — the job plus the same computed state list rows carry. */
  async findOneRow(companyId: string, id: string): Promise<CalibrationJobListRow> {
    const job = await this.findOne(companyId, id);
    const reviewFlags = await this.referenceEquipmentReviewFlags([id]);
    return this.toListRow(job, reviewFlags);
  }

  /**
   * Minimal "Mulai Kalibrasi" action — stamps `startedAt` and moves the job
   * PENDING → IN_PROGRESS. This is the single gate that unblocks the existing
   * reference-equipment recording feature (CALIBRATION_JOB_NOT_STARTED). It is
   * deliberately unopinionated: no precondition beyond the job existing and
   * being PENDING — starting in the field can legitimately happen before
   * identity is confirmed or AKD/AKL is resolved.
   *
   * Not the full job-execution phase (measurement entry, submit-for-review, QA)
   * — that is designed separately alongside MeasurementResult and may later
   * absorb this action.
   */
  async start(companyId: string, id: string): Promise<CalibrationJobDetail> {
    const job = await this.findOne(companyId, id);
    if (job.startedAt !== null || job.status !== "PENDING") {
      throw new ConflictException({
        message: "Calibration job has already been started",
        code: "CALIBRATION_JOB_ALREADY_STARTED",
        status: job.status,
      });
    }

    await prisma.calibrationJob.update({
      where: { id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });

    return this.findOne(companyId, id);
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
        // Human-raised: a text-mismatch resolution must never auto-close this
        // gate (the concern may be forgery, not a typo) — only an explicit
        // manager decision closes it. See AkdAklGateOrigin.
        akdAklGateOpenedBy: "MANUAL_ESCALATION",
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
        // Gate is closing on an explicit decision — drop the provenance so it
        // never carries into a later re-escalation cycle.
        akdAklGateOpenedBy: null,
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
    return Promise.all(rows.map((row) => this.attachCorrectionFiles(companyId, row)));
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
    return this.attachCorrectionFiles(companyId, row);
  }

  private async attachCorrectionFiles(
    companyId: string,
    row: IdentityCorrectionRow,
  ): Promise<IdentityCorrectionDetail> {
    const files = await prisma.fileObject.findMany({
      where: { companyId, ownerType: "IDENTITY_CORRECTION", ownerId: row.id },
      select: { id: true, originalName: true, mimeType: true },
    });
    return { ...row, files };
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
      input.newSerial !== undefined && (input.newSerial ?? null) !== job.technicianObservedSerial;
    const akdAklChanges =
      input.newAkdAkl !== undefined && (input.newAkdAkl ?? null) !== job.technicianObservedAkdAkl;

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
      correction: await this.attachCorrectionFiles(companyId, created),
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

    // APPROVE — if any signer actually signed, the BA sheet's photo must be on file.
    // Both signatures share one physical sheet, so this checks once per correction,
    // not once per signer.
    const hasSignedSigner = correction.signatures.some((s) => s.status === "SIGNED");
    if (hasSignedSigner) {
      const hasImage = await prisma.fileObject.findFirst({
        where: { companyId, ownerType: "IDENTITY_CORRECTION", ownerId: correctionId },
        select: { id: true },
      });
      if (!hasImage) {
        throw new BadRequestException({
          message: "The signed BA sheet's photo has not been uploaded",
          code: "IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING",
        });
      }
    }

    if (correction.newDeviceId) {
      await this.validateDeviceForJob(job, correction.newDeviceId);
    }

    // Locked design decision (Q2): the AKD/AKL regulatory gate is driven by
    // whether the technician-observed izin-edar number matches the customer's
    // declaration — a discrepancy is itself what a TECHNICIAN_MANAGER must
    // review, with no separate manual "escalate" action required. We only
    // re-evaluate the gate when this correction actually changed the AKD/AKL
    // value: an unrelated serial/device-only correction never disturbs it, and
    // any pre-existing stale mismatch is left to a deliberate backfill decision.
    const akdAklCorrected = correction.newAkdAkl !== null;
    const updatedObservedAkdAkl = akdAklCorrected
      ? correction.newAkdAkl
      : job.technicianObservedAkdAkl;
    const akdAklMismatch =
      akdAklCorrected &&
      updatedObservedAkdAkl !== null &&
      updatedObservedAkdAkl !== job.customerDeclaredAkdAkl;

    // Forward: an unreviewed discrepancy opens the gate. Subsumes the old
    // "reopen a previously-APPROVED gate" edge — NOT_REQUIRED / APPROVED /
    // REJECTED → PENDING_REVIEW are all permitted by AKD_AKL_TRANSITIONS.
    const openAkdAklGate = akdAklMismatch && job.akdAklApprovalStatus !== "PENDING_REVIEW";
    // Reverse: a correction that resolves the discrepancy while the gate is
    // still PENDING_REVIEW and undecided removes the reason for review, so
    // unwind it to NOT_REQUIRED. Only for a gate that opened *because of* the
    // text mismatch (AUTO_MISMATCH) — a MANUAL_ESCALATION was raised by a human
    // for a concern the text comparison cannot see and must wait for an
    // explicit manager decision. A gate a manager already decided
    // (APPROVED / REJECTED) is likewise left untouched.
    const clearAkdAklGate =
      akdAklCorrected &&
      !akdAklMismatch &&
      job.akdAklApprovalStatus === "PENDING_REVIEW" &&
      job.akdAklGateOpenedBy === "AUTO_MISMATCH";
    if (openAkdAklGate) {
      assertAkdAklTransition(job.akdAklApprovalStatus, "PENDING_REVIEW");
    }

    await prisma.$transaction(async (tx) => {
      if (correction.newDeviceId) {
        await this.bindDevice(jobId, correction.newDeviceId, tx);
      }

      const jobData: Prisma.CalibrationJobUncheckedUpdateInput = {};
      if (correction.newSerial !== null) jobData.technicianObservedSerial = correction.newSerial;
      if (correction.newAkdAkl !== null) jobData.technicianObservedAkdAkl = correction.newAkdAkl;
      if (openAkdAklGate) {
        jobData.akdAklApprovalStatus = "PENDING_REVIEW";
        Object.assign(jobData, AKD_AKL_GATE_STAMP_RESET);
        jobData.akdAklGateOpenedBy = "AUTO_MISMATCH";
      } else if (clearAkdAklGate) {
        jobData.akdAklApprovalStatus = "NOT_REQUIRED";
        Object.assign(jobData, AKD_AKL_GATE_STAMP_RESET);
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
          akdAklGateReopened: openAkdAklGate,
        },
      });
    });

    return {
      job: await this.findOne(companyId, jobId),
      correction: await this.getIdentityCorrection(companyId, jobId, correctionId),
    };
  }

  private async loadReferenceEquipmentSource(
    companyId: string,
    jobId: string,
  ): Promise<JobReferenceEquipmentSource> {
    const job = await prisma.calibrationJob.findFirst({
      where: { id: jobId, companyId },
      include: jobReferenceEquipmentSourceInclude,
    });
    if (!job) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    return job;
  }

  /** Precomputed picker candidates — sourced from the job's WorkOrder's already-confirmed equipment. */
  async getReferenceEquipmentCandidates(
    companyId: string,
    jobId: string,
  ): Promise<JobReferenceEquipmentCandidate[]> {
    const job = await this.loadReferenceEquipmentSource(companyId, jobId);
    return buildReferenceEquipmentCandidates(job, job.startedAt ?? new Date());
  }

  async listReferenceEquipmentUsed(
    companyId: string,
    jobId: string,
  ): Promise<JobReferenceEquipmentUsedDetail[]> {
    await this.findOne(companyId, jobId);
    return prisma.jobReferenceEquipmentUsed.findMany({
      where: { calibrationJobId: jobId },
      include: jobReferenceEquipmentUsedInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  /** Full-set replace of the reference equipment used on this job. */
  async replaceReferenceEquipmentUsed(
    companyId: string,
    jobId: string,
    userId: string,
    role: MembershipRole,
    input: JobReferenceEquipmentReplaceInput,
  ): Promise<JobReferenceEquipmentUsedDetail[]> {
    const job = await this.loadReferenceEquipmentSource(companyId, jobId);
    if (job.startedAt === null) {
      throw new BadRequestException({
        message: "Record reference equipment only after the job has started",
        code: "CALIBRATION_JOB_NOT_STARTED",
      });
    }
    if (REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES.has(job.status)) {
      throw new BadRequestException({
        message: "Calibration job has advanced past the reference-equipment recording stage",
        code: "CALIBRATION_JOB_REFERENCE_EQUIPMENT_LOCKED",
        status: job.status,
      });
    }

    const canOverride = hasPermission(role, "calibrationJob", "overrideReferenceEquipmentValidity");
    const rows = await validateJobReferenceEquipmentSelection(
      job,
      input.items,
      job.startedAt,
      canOverride,
    );

    await prisma.$transaction(async (tx) => {
      await tx.jobReferenceEquipmentUsed.deleteMany({ where: { calibrationJobId: jobId } });
      if (rows.length > 0) {
        await tx.jobReferenceEquipmentUsed.createMany({
          data: rows.map((row) => ({
            companyId,
            calibrationJobId: jobId,
            equipmentId: row.equipmentId,
            equipmentCalibrationRecordId: row.equipmentCalibrationRecordId,
            validityOverridden: row.validityOverridden,
            overrideReason: row.overrideReason,
            overriddenByUserId: row.validityOverridden ? userId : null,
            overriddenAt: row.validityOverridden ? new Date() : null,
          })),
        });
      }
    });

    return this.listReferenceEquipmentUsed(companyId, jobId);
  }
}
