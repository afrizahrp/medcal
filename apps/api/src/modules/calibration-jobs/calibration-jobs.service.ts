import type { Readable } from "node:stream";
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hasPermission } from "@medcal/auth";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import type { AkdAklApprovalStatus, MembershipRole } from "@medcal/db";
import {
  CALIBRATION_JOB_SORTABLE_FIELDS,
  buildCalibrationJobActionSignals,
  jobNeedsAction,
  type CalibrationJobActionSignals,
  type CalibrationJobEscalateIdentityInput,
  type CalibrationJobIdentityDecisionInput,
  type CalibrationJobListQuery,
  type IdentityCorrectionDecisionInput,
  type IdentityCorrectionSubmitInput,
  type JobReferenceEquipmentApprovalDecisionInput,
  type JobReferenceEquipmentReplaceInput,
  type QualityReviewDecisionInput,
} from "@medcal/shared";

import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";
import { FilesService } from "../files/files.service";
import {
  renderIdentityCorrectionPdf,
  type IdentityCorrectionPdfResult,
} from "./identity-correction-pdf";
import {
  buildReferenceEquipmentCandidates,
  jobNeedsReferenceEquipmentReview,
  jobReferenceEquipmentApprovalInclude,
  jobReferenceEquipmentReviewInclude,
  jobReferenceEquipmentSourceInclude,
  jobReferenceEquipmentUsedInclude,
  requiredEquipmentTypeIdsByDeviceType,
  reviewSourceDeviceTypeId,
  usedRowRequiresOverride,
  validateJobReferenceEquipmentSelection,
  type JobReferenceEquipmentApprovalDetail,
  type JobReferenceEquipmentCandidate,
  type JobReferenceEquipmentSource,
  type JobReferenceEquipmentUsedDetail,
} from "./job-reference-equipment";
import { assertKontrolAlatReadyForStart } from "./kontrol-alat.service";
import { copyActiveTestPointsIntoJobSnapshot } from "./job-calibration-test-point-snapshot";
import {
  CALIBRATION_MEASUREMENTS_INCOMPLETE,
  evaluateMeasurementCompleteness,
  MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES,
} from "./measurement-completeness";
import { orderByLogicalTest } from "./logical-test-grouping";

const calibrationJobInclude = {
  workOrder: {
    select: {
      id: true,
      number: true,
      status: true,
      serviceMode: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
      purchaseOrder: { select: { customerPoNumber: true, number: true } },
      requestReviewCompletedAt: true,
    },
  },
  kontrolAlat: {
    select: {
      id: true,
      number: true,
      completedAt: true,
      certificateNumber: true,
      workExecuted: true,
    },
  },
  device: {
    select: {
      id: true,
      code: true,
      brand: true,
      model: true,
      serialNumber: true,
      deviceTypeId: true,
      customerId: true,
    },
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
  // Latest Reference Equipment Approval (any status). At most one PENDING_REVIEW
  // per job (enforced on submit). Drives Tech PWA / Portal pending banner.
  referenceEquipmentApprovals: {
    select: {
      id: true,
      status: true,
      createdAt: true,
      submittedByUserId: true,
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  // Latest QualityReview — technician/MT read "has MT approved?" from GET job.
  // Created only on decide (reviewerUserId is required). Happy path: 0 or 1.
  reviews: {
    select: {
      id: true,
      status: true,
      decision: true,
      notes: true,
      reviewerUserId: true,
      reviewedAt: true,
      createdAt: true,
      reviewer: { select: { id: true, name: true } },
    },
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

/** Pattern D generic-slot — needs suppliedNominalValue, not a Stage B setpoint grid. */
const GRID_EXCLUDED_PARAMETER_CODES = MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES;

/**
 * Job statuses at which the identity of a job is frozen — the same boundary as
 * IDENTITY_LOCKED_JOB_STATUSES, expressed as an array for Prisma `notIn`.
 */
/**
 * submitForReview refused because an IdentityCorrection is still awaiting a
 * TECHNICIAN_MANAGER decision (MoM #6). Deliberately distinct from
 * IDENTITY_CORRECTION_ALREADY_PENDING, which means "you cannot file a second
 * BA on this job" — a different actor, a different remedy. Mirrors the
 * REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED naming already used for the
 * equivalent reference-equipment gate.
 */
export const IDENTITY_CORRECTION_UNRESOLVED = "IDENTITY_CORRECTION_UNRESOLVED";

const PRE_SUBMIT_EXCLUDED_STATUSES = ["SUBMITTED", "ACCEPTED_BY_QA"] as const;

/**
 * MoM #6 race guard. Conditionally touches the CalibrationJob row *inside* the
 * caller's transaction and fails when the job has already left the pre-submit
 * phase. Two things follow from this being an UPDATE rather than a SELECT:
 * the row is locked for the rest of the transaction, so a concurrent
 * submitForReview (which CAS-updates the very same row) is serialised behind
 * it; and the status is re-read at that moment rather than from a stale
 * pre-transaction load. Used by both BA submission and BA decision so neither
 * can slip past a job that is being submitted concurrently.
 */
async function assertJobStillPreSubmit(
  tx: Prisma.TransactionClient,
  jobId: string,
  companyId: string,
): Promise<void> {
  const claimed = await tx.calibrationJob.updateMany({
    where: { id: jobId, companyId, status: { notIn: [...PRE_SUBMIT_EXCLUDED_STATUSES] } },
    data: { updatedAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new BadRequestException({
      message: "Calibration job has advanced past the identity gate",
      code: "CALIBRATION_JOB_IDENTITY_GATE_LOCKED",
    });
  }
}

/**
 * The identity values a new correction is measured against. The job's own
 * observed value wins; where the job has not observed one yet the assigned
 * Device master supplies the baseline, so "re-stating what the master already
 * says" is correctly rejected as a no-op correction. Mirrors the LK read
 * precedence exactly (MoM #6).
 */
function currentObservedBrand(job: CalibrationJobDetail): string | null {
  return job.technicianObservedBrand ?? job.device?.brand ?? null;
}

function currentObservedModel(job: CalibrationJobDetail): string | null {
  return job.technicianObservedModel ?? job.device?.model ?? null;
}

function currentObservedSerial(job: CalibrationJobDetail): string | null {
  return job.technicianObservedSerial ?? job.device?.serialNumber ?? null;
}

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
 *  - `actionSignals` is the extensible per-job signal map of *actionable*
 *    remediations only (Identity Correction pending, Reference Equipment needs
 *    approval, incomplete identity while the gate is open, …future phases).
 *    Lifecycle-locked facts must not appear here — see
 *    buildCalibrationJobActionSignals. The Calibration Jobs list groups by SPK
 *    and shows an aggregate count of child jobs with ≥1 signal. Both are
 *    computed state; see jobNeedsReferenceEquipmentReview and toListRow.
 */
export type CalibrationJobListRow = CalibrationJobDetail & {
  needsReferenceEquipmentReview: boolean;
  actionSignals: CalibrationJobActionSignals;
};

/**
 * One directly-entered ("Pattern A") calibration parameter for a job's resolved
 * DeviceType: valueType NUMBER, entryStyle DIRECT_REPLICATES or DERIVED
 * (Phase 4B), active, no CalibrationTestPoint children. The tech-pwa
 * measurement-entry skeleton (Stage A) lists these. Decimal columns are
 * stringified (same wire shape as `DeviceCalibrationParameter.toleranceMin`
 * everywhere else in this API). `entryStyle` itself is a filter-only concern —
 * never returned on the wire, same as LOGGER_SUMMARY exclusion before it — so a
 * DERIVED row and a DIRECT_REPLICATES row are indistinguishable to the client;
 * both are just an ordinary manual reading.
 */
export interface MeasurementParameterSummary {
  id: string;
  code: string;
  name: string;
  /** Digits after the decimal point for the measured value. Placeholder 0 today. */
  decimalPlaces: number | null;
  uom: { code: string; symbol: string } | null;
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceNote: string | null;
  capabilityName: string;
  capabilityItemName: string;
  /**
   * Phase 4A (Gap A) — catalog/presentation grouping. Non-null on parameters
   * that are one measured quantity of a multi-quantity logical test (Dental
   * X-Ray kV + s + mGy). NULL on every standalone parameter, which is the
   * pre-Phase-4A behaviour. Never part of measurement identity.
   */
  logicalTestKey: string | null;
  logicalTestSequence: number | null;
}

/** One active CalibrationTestPoint nested under a Pattern B grid parameter. */
export interface MeasurementTestPointSummary {
  id: string;
  sequence: number;
  settingLabel: string;
  settingValue: string | null;
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceNote: string | null;
}

/**
 * Pattern B (test-point grid) catalog row. Same scalars as Pattern A plus the
 * ordered active test points the tech-pwa grid renders as rows.
 */
export interface MeasurementGridParameterSummary extends MeasurementParameterSummary {
  testPoints: MeasurementTestPointSummary[];
}

/** Direct replicate list vs test-point grid — same eligibility as parameters[] / gridParameters. */
export type MeasurementParameterKind = "DIRECT" | "GRID";

export interface MeasurementCapabilityRef {
  id: string;
  code: string;
  name: string;
}

/**
 * One eligible parameter inside a capability group. `kind` is the direct/grid
 * discriminant; `testPoints` is empty on DIRECT and ordered by `sequence` on GRID.
 */
export interface MeasurementGroupedParameter extends MeasurementParameterSummary {
  kind: MeasurementParameterKind;
  testPoints: MeasurementTestPointSummary[];
}

/**
 * Capability section for the tech-pwa LK-oriented list. Capabilities are ordered
 * by DeviceTypeCapabilityOrder.sortOrder; parameters inside a group by
 * DeviceCalibrationParameter.sortOrder (capability-scoped).
 */
export interface MeasurementCapabilityGroup {
  capability: MeasurementCapabilityRef;
  /** Persisted per-DeviceType order; null when no DeviceTypeCapabilityOrder row exists. */
  sortOrder: number | null;
  parameters: MeasurementGroupedParameter[];
}

export interface JobMeasurementParametersResult {
  /** Null when the job's DeviceType can't be resolved from the commercial chain. */
  deviceType: { id: string; name: string } | null;
  parameters: MeasurementParameterSummary[];
  /** Pattern B / D-fixed grids. Additive — Stage A clients that ignore this stay valid. */
  gridParameters: MeasurementGridParameterSummary[];
  /**
   * LK-oriented tree. Additive — existing clients that only read parameters[] /
   * gridParameters[] stay valid. Empty when the DeviceType cannot be resolved.
   */
  capabilityGroups: MeasurementCapabilityGroup[];
}

const measurementParameterSelect = {
  id: true,
  code: true,
  name: true,
  sortOrder: true,
  decimalPlaces: true,
  toleranceMin: true,
  toleranceMax: true,
  toleranceNote: true,
  logicalTestKey: true,
  logicalTestSequence: true,
  uom: { select: { code: true, symbol: true } },
  capabilityItem: {
    select: {
      name: true,
      capability: { select: { id: true, code: true, name: true } },
    },
  },
} as const;

type MeasurementParameterRow = Prisma.DeviceCalibrationParameterGetPayload<{
  select: typeof measurementParameterSelect;
}>;

type MeasurementTestPointRow = {
  id: string;
  sequence: number;
  settingLabel: string;
  settingValue: Prisma.Decimal | null;
  toleranceMin: Prisma.Decimal | null;
  toleranceMax: Prisma.Decimal | null;
  toleranceNote: string | null;
};

function toParameterSummary(row: MeasurementParameterRow): MeasurementParameterSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    decimalPlaces: row.decimalPlaces,
    uom: row.uom,
    toleranceMin: row.toleranceMin?.toString() ?? null,
    toleranceMax: row.toleranceMax?.toString() ?? null,
    toleranceNote: row.toleranceNote,
    capabilityName: row.capabilityItem.capability.name,
    capabilityItemName: row.capabilityItem.name,
    logicalTestKey: row.logicalTestKey,
    logicalTestSequence: row.logicalTestSequence,
  };
}

function toTestPointSummary(tp: MeasurementTestPointRow): MeasurementTestPointSummary {
  return {
    id: tp.id,
    sequence: tp.sequence,
    settingLabel: tp.settingLabel,
    settingValue: tp.settingValue?.toString() ?? null,
    toleranceMin: tp.toleranceMin?.toString() ?? null,
    toleranceMax: tp.toleranceMax?.toString() ?? null,
    toleranceNote: tp.toleranceNote,
  };
}

function toGroupedParameter(
  row: MeasurementParameterRow,
  kind: MeasurementParameterKind,
  testPoints: MeasurementTestPointSummary[],
): MeasurementGroupedParameter {
  return {
    ...toParameterSummary(row),
    kind,
    testPoints,
  };
}

/**
 * Group eligible parameters by capability ID and order both levels from the
 * existing catalog: DeviceTypeCapabilityOrder, then parameter sortOrder.
 * Missing capability-order rows go last; tie-break is capability id (stable,
 * not display-name alphabetical). Parameter ties use name then id, matching
 * the existing Prisma orderBy on the ungrouped arrays.
 */
function buildMeasurementCapabilityGroups(
  items: Array<{
    row: MeasurementParameterRow;
    kind: MeasurementParameterKind;
    testPoints: MeasurementTestPointSummary[];
  }>,
  sortOrderByCapabilityId: Map<string, number>,
): MeasurementCapabilityGroup[] {
  const buckets = new Map<
    string,
    {
      capability: MeasurementCapabilityRef;
      sortOrder: number | null;
      items: Array<{
        parameterSortOrder: number;
        name: string;
        id: string;
        grouped: MeasurementGroupedParameter;
      }>;
    }
  >();

  for (const item of items) {
    const capability = item.row.capabilityItem.capability;
    let bucket = buckets.get(capability.id);
    if (!bucket) {
      bucket = {
        capability: { id: capability.id, code: capability.code, name: capability.name },
        sortOrder: sortOrderByCapabilityId.get(capability.id) ?? null,
        items: [],
      };
      buckets.set(capability.id, bucket);
    }
    bucket.items.push({
      parameterSortOrder: item.row.sortOrder,
      name: item.row.name,
      id: item.row.id,
      grouped: toGroupedParameter(item.row, item.kind, item.testPoints),
    });
  }

  const groups = [...buckets.values()];
  groups.sort((a, b) => {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.capability.id.localeCompare(b.capability.id);
  });

  return groups.map((group) => {
    group.items.sort((a, b) => {
      if (a.parameterSortOrder !== b.parameterSortOrder) {
        return a.parameterSortOrder - b.parameterSortOrder;
      }
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.id.localeCompare(b.id);
    });
    // Phase 4A: keep the quantities of one logical test contiguous and in their
    // declared order, without disturbing the catalog order around them.
    const ordered = orderByLogicalTest(
      group.items.map((entry) => ({
        id: entry.id,
        logicalTestKey: entry.grouped.logicalTestKey,
        logicalTestSequence: entry.grouped.logicalTestSequence,
        entry,
      })),
    );
    return {
      capability: group.capability,
      sortOrder: group.sortOrder,
      parameters: ordered.map((item) => item.entry.grouped),
    };
  });
}

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
}

@Injectable()
export class CalibrationJobsService {

  constructor(@Inject(FilesService) private readonly files: FilesService) {}

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
    const needsReferenceEquipmentApproval = reviewFlags.get(row.id) ?? false;
    return {
      ...row,
      needsReferenceEquipmentReview: needsReferenceEquipmentApproval,
      // Only actionable signals — locked-stage facts must not inflate "perlu tindakan".
      actionSignals: buildCalibrationJobActionSignals({
        status: row.status,
        startedAt: row.startedAt,
        deviceId: row.deviceId,
        technicianObservedSerial: row.technicianObservedSerial,
        hasPendingIdentityCorrection: row.identityCorrections[0]?.status === "PENDING_REVIEW",
        needsReferenceEquipmentApproval,
      }),
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
   * PENDING → IN_PROGRESS. This unblocks reference-equipment recording
   * (CALIBRATION_JOB_NOT_STARTED). Identity / AKD/AKL may still be unresolved.
   *
   * SEND_TO_LAB (WOL) additionally requires Kontrol Alat complete + dual-signed
   * and workExecuted === true. ON_SITE (SPK) is not gated by Kontrol Alat.
   * requestReviewCompletedAt and functionFinalOk are not part of this gate.
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

    await assertKontrolAlatReadyForStart(job.workOrder.serviceMode, job.id);

    const deviceTypeId = this.resolveJobDeviceTypeId(job);
    const startedAt = new Date();

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.calibrationJob.updateMany({
        where: { id, companyId, status: "PENDING", startedAt: null },
        data: {
          status: "IN_PROGRESS",
          startedAt,
          measurementTestPointsSnapshottedAt: startedAt,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          message: "Calibration job has already been started",
          code: "CALIBRATION_JOB_ALREADY_STARTED",
        });
      }

      await copyActiveTestPointsIntoJobSnapshot(tx, {
        calibrationJobId: id,
        deviceTypeId,
      });
    });

    return this.findOne(companyId, id);
  }

  /**
   * Technician hands the current attempt to MT: IN_PROGRESS → SUBMITTED,
   * stamps submittedAt. Measurement writes lock via the existing guard.
   * REJECT/REWORK is not handled here.
   */
  async submitForReview(companyId: string, id: string): Promise<CalibrationJobDetail> {
    const job = await this.findOne(companyId, id);
    if (job.status === "SUBMITTED" || job.status === "ACCEPTED_BY_QA") {
      throw new ConflictException({
        message: "Calibration job has already been submitted",
        code: "CALIBRATION_JOB_ALREADY_SUBMITTED",
        status: job.status,
      });
    }
    if (job.status !== "IN_PROGRESS" || job.startedAt === null) {
      throw new BadRequestException({
        message: "Calibration job must be in progress to submit for review",
        code: "CALIBRATION_JOB_NOT_IN_PROGRESS",
        status: job.status,
      });
    }

    await this.assertMeasurementsCompleteForSubmit(companyId, job);

    await this.assertReferenceEquipmentResolvedForSubmit(companyId, id);

    // Fail fast with the precise error before opening a transaction. The
    // authoritative check is re-run under the row lock below — this one exists
    // so the ordinary (uncontended) case reports the right code and message.
    await this.assertNoPendingIdentityCorrectionForSubmit(companyId, id);

    // MoM #6 invariant: a job must never be SUBMITTED while it still has a
    // PENDING_REVIEW IdentityCorrection. A bare read check cannot hold that —
    // a BA can be created, and a decision can land, between the check and the
    // write. So the CAS transition happens first *inside* a transaction, which
    // locks the job row; the pending re-check then runs while that lock is
    // held. submitIdentityCorrection and decideIdentityCorrection both touch
    // the same row through assertJobStillPreSubmit, so they serialise against
    // this block: whichever commits second observes the other's effect and
    // fails. Throwing here rolls the transition back.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.calibrationJob.updateMany({
        where: { id, companyId, status: "IN_PROGRESS" },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          message: "Calibration job has already been submitted",
          code: "CALIBRATION_JOB_ALREADY_SUBMITTED",
        });
      }

      const pending = await tx.identityCorrection.findFirst({
        where: { companyId, calibrationJobId: id, status: "PENDING_REVIEW" },
        select: { id: true, number: true },
      });
      if (pending) {
        throw new ConflictException({
          message:
            "Calibration job has a pending Identity Correction that must be approved or rejected before submission",
          code: IDENTITY_CORRECTION_UNRESOLVED,
          correctionId: pending.id,
          number: pending.number,
        });
      }
    });

    return this.findOne(companyId, id);
  }

  /**
   * TECHNICIAN_MANAGER decide. APPROVE: create QualityReview; job stays SUBMITTED;
   * measurements stay locked (happy path — do not change these semantics).
   * REJECT: atomic SUBMITTED → REWORK, submittedAt null, currentAttempt +1,
   * QualityReview REJECTED with mandatory notes.
   */
  async decideQualityReview(
    companyId: string,
    id: string,
    userId: string,
    input: QualityReviewDecisionInput,
  ): Promise<CalibrationJobDetail> {
    const job = await this.findOne(companyId, id);
    if (job.status !== "SUBMITTED") {
      throw new BadRequestException({
        message: "Quality review is only available on a submitted job",
        code: "CALIBRATION_JOB_NOT_SUBMITTED",
        status: job.status,
      });
    }

    const alreadyApproved = await prisma.qualityReview.findFirst({
      where: { companyId, calibrationJobId: id, status: "APPROVED" },
      select: { id: true },
    });
    if (alreadyApproved) {
      throw new ConflictException({
        message: "This job already has an approved quality review",
        code: "QUALITY_REVIEW_ALREADY_APPROVED",
        reviewId: alreadyApproved.id,
      });
    }

    if (input.decision === "REJECT") {
      const notes = input.notes?.trim() ?? "";
      if (!notes) {
        throw new BadRequestException({
          message: "A decision note is required when rejecting",
          code: "QUALITY_REVIEW_NOTES_REQUIRED",
        });
      }

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.calibrationJob.updateMany({
          where: { id, companyId, status: "SUBMITTED" },
          data: {
            status: "REWORK",
            submittedAt: null,
            currentAttempt: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException({
            message: "This submission has already been decided",
            code: "QUALITY_REVIEW_ALREADY_DECIDED",
          });
        }
        await tx.qualityReview.create({
          data: {
            companyId,
            calibrationJobId: id,
            reviewerUserId: userId,
            decision: "REJECT",
            status: "REJECTED",
            notes,
            reviewedAt: new Date(),
          },
        });
      });

      return this.findOne(companyId, id);
    }

    const notes = input.notes && input.notes.length > 0 ? input.notes : null;
    await prisma.qualityReview.create({
      data: {
        companyId,
        calibrationJobId: id,
        reviewerUserId: userId,
        decision: "APPROVE",
        status: "APPROVED",
        notes,
        reviewedAt: new Date(),
      },
    });

    return this.findOne(companyId, id);
  }

  /**
   * Technician resume after MT REJECT: REWORK → IN_PROGRESS. Does not increment
   * currentAttempt, does not stamp submittedAt, does not create reviews/results.
   * Resume is the backend write gate for the new attempt.
   */
  async resumeAfterRework(companyId: string, id: string): Promise<CalibrationJobDetail> {
    const job = await this.findOne(companyId, id);
    if (job.status !== "REWORK") {
      throw new BadRequestException({
        message: "Calibration job must be in rework to resume",
        code: "CALIBRATION_JOB_NOT_IN_REWORK",
        status: job.status,
      });
    }

    const updated = await prisma.calibrationJob.updateMany({
      where: { id, companyId, status: "REWORK" },
      data: { status: "IN_PROGRESS" },
    });
    if (updated.count !== 1) {
      throw new ConflictException({
        message: "Calibration job has already been resumed",
        code: "CALIBRATION_JOB_ALREADY_RESUMED",
      });
    }

    return this.findOne(companyId, id);
  }

  /**
   * Technician close after MT approve: SUBMITTED + latest QualityReview APPROVED
   * → ACCEPTED_BY_QA. Does not increment currentAttempt.
   */
  async complete(companyId: string, id: string): Promise<CalibrationJobDetail> {
    const job = await this.findOne(companyId, id);
    if (job.status === "ACCEPTED_BY_QA") {
      throw new ConflictException({
        message: "Calibration job has already been completed",
        code: "CALIBRATION_JOB_ALREADY_COMPLETED",
        status: job.status,
      });
    }
    if (job.status !== "SUBMITTED") {
      throw new BadRequestException({
        message: "Calibration job must be submitted and approved before complete",
        code: "CALIBRATION_JOB_NOT_SUBMITTED",
        status: job.status,
      });
    }

    const latestReview = await prisma.qualityReview.findFirst({
      where: { companyId, calibrationJobId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, decision: true },
    });
    if (latestReview?.status !== "APPROVED" || latestReview.decision !== "APPROVE") {
      throw new BadRequestException({
        message: "Technician complete requires an approved quality review",
        code: "QUALITY_REVIEW_NOT_APPROVED",
      });
    }

    // MoM #6: ACCEPTED_BY_QA is the master commit point. The approved observed
    // identity is written through to the Device master in the SAME transaction
    // as the status transition, so the two can never disagree: if the master
    // update fails the job does not become ACCEPTED_BY_QA, and once it is
    // ACCEPTED_BY_QA (the gate LK download checks) the commit has succeeded.
    // The Device itself is never replaced — only these three scalar fields, and
    // only where the job actually observed a value. A NULL observed value
    // leaves the master field untouched.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.calibrationJob.updateMany({
        where: { id, companyId, status: "SUBMITTED" },
        data: { status: "ACCEPTED_BY_QA" },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          message: "Calibration job has already been completed",
          code: "CALIBRATION_JOB_ALREADY_COMPLETED",
        });
      }

      if (job.deviceId === null) return;

      const masterData: Prisma.DeviceUncheckedUpdateInput = {};
      if (job.technicianObservedBrand !== null) masterData.brand = job.technicianObservedBrand;
      if (job.technicianObservedModel !== null) masterData.model = job.technicianObservedModel;
      if (job.technicianObservedSerial !== null) {
        masterData.serialNumber = job.technicianObservedSerial;
      }
      if (Object.keys(masterData).length === 0) return;

      // Scoped by companyId as well as id — Device.id alone must never be
      // enough to write across a company boundary.
      const committed = await tx.device.updateMany({
        where: { id: job.deviceId, companyId },
        data: masterData,
      });
      if (committed.count !== 1) {
        throw new ConflictException({
          message: "Failed to commit the observed identity to the device master",
          code: "DEVICE_MASTER_COMMIT_FAILED",
          deviceId: job.deviceId,
        });
      }
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
   * Printable "Berita Acara Koreksi Identitas" for one Identity Correction —
   * same PKM/KAN letterhead as the SPK / Surat Jalan Alat. The BA photo (at
   * most one per correction) is streamed through FilesService using the
   * caller's own role, so access to the embedded image is governed by the
   * exact same `calibrationJob` permission as the BA record itself.
   */
  async buildIdentityCorrectionPdf(
    companyId: string,
    jobId: string,
    correctionId: string,
    role: MembershipRole,
  ): Promise<IdentityCorrectionPdfResult> {
    const job = await this.findOne(companyId, jobId);
    const correction = await this.getIdentityCorrection(companyId, jobId, correctionId);
    const company = await prisma.company.findFirst({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({ message: "Company not found", code: "COMPANY_NOT_FOUND" });
    }

    const photoFile = correction.files[0];
    const photo = photoFile
      ? await (async () => {
          const { stream, fileObject } = await this.files.getForDownload(
            companyId,
            photoFile.id,
            role,
          );
          return {
            buffer: await streamToBuffer(stream),
            mimeType: fileObject.mimeType,
            originalName: fileObject.originalName,
          };
        })()
      : null;

    return renderIdentityCorrectionPdf({ correction, job, company, photo });
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
    // from what is currently on the job. MoM #6: the comparison baseline for
    // Brand/Model/Serial is the job's own observed identity, falling back to
    // the assigned Device master when the job has not observed one yet — a
    // first-time observation of a value the master already carries is not a
    // correction.
    const brandChanges =
      input.newBrand !== undefined && (input.newBrand ?? null) !== currentObservedBrand(job);
    const modelChanges =
      input.newModel !== undefined && (input.newModel ?? null) !== currentObservedModel(job);
    const serialChanges =
      input.newSerial !== undefined && (input.newSerial ?? null) !== currentObservedSerial(job);
    const akdAklChanges =
      input.newAkdAkl !== undefined && (input.newAkdAkl ?? null) !== job.technicianObservedAkdAkl;

    if (!brandChanges && !modelChanges && !serialChanges && !akdAklChanges) {
      throw new BadRequestException({
        message: "The correction does not change any of the job's current identity values",
        code: "IDENTITY_CORRECTION_NO_CHANGE",
      });
    }

    const issuedAt = new Date();

    const created = await prisma.$transaction(async (tx) => {
      // MoM #6 race guard: a BA must never appear on a job that is being
      // submitted concurrently, or it would be born already undecidable.
      // Locks the job row for this transaction — see assertJobStillPreSubmit.
      await assertJobStillPreSubmit(tx, jobId, companyId);

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
          ...(brandChanges
            ? {
                prevBrand: currentObservedBrand(job),
                newBrand: input.newBrand ?? null,
              }
            : {}),
          ...(modelChanges
            ? {
                prevModel: currentObservedModel(job),
                newModel: input.newModel ?? null,
              }
            : {}),
          ...(serialChanges
            ? {
                prevSerial: currentObservedSerial(job),
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

    // Locked design decision (Q2): the AKD/AKL regulatory gate is driven by
    // whether the technician-observed izin-edar number matches the customer's
    // declaration — a discrepancy is itself what a TECHNICIAN_MANAGER must
    // review, with no separate manual "escalate" action required. We only
    // re-evaluate the gate when this correction actually changed the AKD/AKL
    // value: an unrelated brand/model/serial-only correction never disturbs it, and
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
      // MoM #6 race guard: take the job row inside this transaction and prove
      // it is still pre-submit. Serialises this decision against a concurrent
      // submitForReview (which CAS-updates the same row), so an approval can
      // never land on a job that has meanwhile become SUBMITTED.
      await assertJobStillPreSubmit(tx, jobId, companyId);

      // CalibrationJob.deviceId is NEVER touched here: the Device assigned by
      // the WO/SPK is locked (MoM #6). A BA only corrects observed identity.
      const jobData: Prisma.CalibrationJobUncheckedUpdateInput = {};
      if (correction.newBrand !== null) jobData.technicianObservedBrand = correction.newBrand;
      if (correction.newModel !== null) jobData.technicianObservedModel = correction.newModel;
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
  /**
   * Calibration parameters for a job's resolved DeviceType.
   *
   * Pattern A (`parameters`): NUMBER, DIRECT_REPLICATES or DERIVED, active, no
   * CalibrationTestPoint children. Pattern B (`gridParameters`): same filters
   * except they HAVE active test-point children. LOGGER_SUMMARY is excluded
   * from both via `entryStyle`. SUCT_VACUUM_GAUGE (generic-slot + on-site
   * nominal) is excluded from the grid by code allowlist — Pattern D, not Stage B.
   *
   * Phase 4B (Gap B): DERIVED is included here so a derived value (Autoclave
   * ΔT, a magnification ratio) can be typed in like any other reading — see
   * `DeviceCalibrationParameter.derivation`. It is still an ordinary
   * MeasurementResult; nothing is computed or auto-filled for it.
   *
   * `capabilityGroups` is additive: the same eligible rows, grouped by
   * DeviceCapability id and ordered by DeviceTypeCapabilityOrder then
   * DeviceCalibrationParameter.sortOrder.
   */
  async listMeasurementParameters(
    companyId: string,
    jobId: string,
  ): Promise<JobMeasurementParametersResult> {
    const job = await this.findOne(companyId, jobId);
    const deviceTypeId = this.resolveJobDeviceTypeId(job);
    if (deviceTypeId === null) {
      return { deviceType: null, parameters: [], gridParameters: [], capabilityGroups: [] };
    }

    const [deviceType, eligible, capabilityOrders] = await Promise.all([
      prisma.deviceType.findUnique({
        where: { id: deviceTypeId },
        select: { id: true, name: true },
      }),
      prisma.deviceCalibrationParameter.findMany({
        where: {
          deviceTypeId,
          isActive: true,
          valueType: "NUMBER",
          // Phase 4B (Gap B): DERIVED participates in the same worksheet flow
          // as DIRECT_REPLICATES — see the method doc comment above.
          entryStyle: { in: ["DIRECT_REPLICATES", "DERIVED"] },
        },
        select: {
          ...measurementParameterSelect,
          testPoints: {
            where: { isActive: true },
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              sequence: true,
              settingLabel: true,
              settingValue: true,
              toleranceMin: true,
              toleranceMax: true,
              toleranceNote: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.deviceTypeCapabilityOrder.findMany({
        where: { deviceTypeId },
        select: { capabilityId: true, sortOrder: true },
      }),
    ]);

    const useSnapshot = job.measurementTestPointsSnapshottedAt != null;
    const snapshots = useSnapshot
      ? await prisma.jobCalibrationTestPoint.findMany({
          where: { calibrationJobId: jobId },
          orderBy: { sequence: "asc" },
        })
      : [];
    const snapshotsByParameterId = new Map<string, typeof snapshots>();
    for (const row of snapshots) {
      const list = snapshotsByParameterId.get(row.deviceCalibrationParameterId) ?? [];
      list.push(row);
      snapshotsByParameterId.set(row.deviceCalibrationParameterId, list);
    }

    const excluded = new Set<string>(GRID_EXCLUDED_PARAMETER_CODES);
    const directRows: typeof eligible = [];
    const gridItems: Array<{
      row: (typeof eligible)[number];
      testPoints: MeasurementTestPointSummary[];
    }> = [];

    for (const row of eligible) {
      if (excluded.has(row.code)) continue;
      const frozen = snapshotsByParameterId.get(row.id) ?? [];
      const livePoints = row.testPoints;
      const isGrid = useSnapshot ? frozen.length > 0 : livePoints.length > 0;
      if (!isGrid) {
        if (useSnapshot || livePoints.length === 0) directRows.push(row);
        continue;
      }
      const testPoints = useSnapshot
        ? frozen.map((tp) =>
            toTestPointSummary({
              id: tp.sourceCalibrationTestPointId,
              sequence: tp.sequence,
              settingLabel: tp.settingLabel,
              settingValue: tp.settingValue,
              toleranceMin: tp.toleranceMin,
              toleranceMax: tp.toleranceMax,
              toleranceNote: tp.toleranceNote,
            }),
          )
        : livePoints.map(toTestPointSummary);
      gridItems.push({ row, testPoints });
    }

    // Phase 4A: the flat Pattern A / Pattern B arrays get the same contiguous
    // logical-test ordering as `capabilityGroups`. Catalogs with no grouping
    // declared come back in exactly the order they had before.
    const parameters = orderByLogicalTest(directRows.map(toParameterSummary));
    const gridParameters = orderByLogicalTest(
      gridItems.map((item) => ({
        ...toParameterSummary(item.row),
        testPoints: item.testPoints,
      })),
    );
    const sortOrderByCapabilityId = new Map(
      capabilityOrders.map((row) => [row.capabilityId, row.sortOrder] as const),
    );

    return {
      deviceType: deviceType ?? { id: deviceTypeId, name: "" },
      parameters,
      gridParameters,
      capabilityGroups: buildMeasurementCapabilityGroups(
        [
          ...directRows.map((row) => ({ row, kind: "DIRECT" as const, testPoints: [] })),
          ...gridItems.map((item) => ({
            row: item.row,
            kind: "GRID" as const,
            testPoints: item.testPoints,
          })),
        ],
        sortOrderByCapabilityId,
      ),
    };
  }

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

    const pending = await this.findPendingReferenceEquipmentApproval(jobId);
    if (pending) {
      throw new ConflictException({
        message: "Reference equipment cannot be replaced while an approval request is pending",
        code: "REFERENCE_EQUIPMENT_APPROVAL_ALREADY_PENDING",
        approvalId: pending.id,
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

  async listReferenceEquipmentApprovals(
    companyId: string,
    jobId: string,
  ): Promise<JobReferenceEquipmentApprovalDetail[]> {
    await this.findOne(companyId, jobId);
    return prisma.jobReferenceEquipmentApproval.findMany({
      where: { companyId, calibrationJobId: jobId },
      include: jobReferenceEquipmentApprovalInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Technician (or MT) asks MT to accept the recorded set. Does not change
   * CalibrationJob.status / submittedAt and does not call submitForReview.
   */
  async submitReferenceEquipmentApproval(
    companyId: string,
    jobId: string,
    userId: string,
  ): Promise<JobReferenceEquipmentApprovalDetail> {
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

    const existingPending = await this.findPendingReferenceEquipmentApproval(jobId);
    if (existingPending) {
      throw new ConflictException({
        message: "This job already has a reference-equipment approval awaiting review",
        code: "REFERENCE_EQUIPMENT_APPROVAL_ALREADY_PENDING",
        approvalId: existingPending.id,
      });
    }

    const used = await prisma.jobReferenceEquipmentUsed.findMany({
      where: { calibrationJobId: jobId },
      orderBy: { createdAt: "asc" },
    });
    const asOf = job.startedAt;
    const items = used.map((row) => {
      const { requiresOverride, validity } = usedRowRequiresOverride(row, job, asOf);
      return {
        companyId,
        equipmentId: row.equipmentId,
        equipmentCalibrationRecordId: validity.recordId,
        validityStatus: validity.status,
        requiresOverride,
      };
    });
    if (!items.some((item) => item.requiresOverride)) {
      throw new BadRequestException({
        message: "No selected reference equipment requires manager approval",
        code: "REFERENCE_EQUIPMENT_APPROVAL_NOT_REQUIRED",
      });
    }

    const created = await prisma.jobReferenceEquipmentApproval.create({
      data: {
        companyId,
        calibrationJobId: jobId,
        submittedByUserId: userId,
        items: { create: items },
      },
      include: jobReferenceEquipmentApprovalInclude,
    });
    return created;
  }

  async decideReferenceEquipmentApproval(
    companyId: string,
    jobId: string,
    approvalId: string,
    userId: string,
    input: JobReferenceEquipmentApprovalDecisionInput,
  ): Promise<JobReferenceEquipmentApprovalDetail> {
    const job = await this.loadReferenceEquipmentSource(companyId, jobId);
    if (REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES.has(job.status)) {
      throw new BadRequestException({
        message: "Calibration job has advanced past the reference-equipment recording stage",
        code: "CALIBRATION_JOB_REFERENCE_EQUIPMENT_LOCKED",
        status: job.status,
      });
    }

    const approval = await prisma.jobReferenceEquipmentApproval.findFirst({
      where: { id: approvalId, companyId, calibrationJobId: jobId },
      include: jobReferenceEquipmentApprovalInclude,
    });
    if (!approval) {
      throw new NotFoundException({
        message: "Reference equipment approval not found",
        code: "REFERENCE_EQUIPMENT_APPROVAL_NOT_FOUND",
      });
    }
    if (approval.status !== "PENDING_REVIEW") {
      throw new BadRequestException({
        message: `Reference equipment approval is already ${approval.status}`,
        code: "REFERENCE_EQUIPMENT_APPROVAL_ALREADY_DECIDED",
        status: approval.status,
      });
    }

    const decidedAt = new Date();

    if (input.decision === "REJECT") {
      if (!input.decisionNote?.trim()) {
        throw new BadRequestException({
          message: "A decision note is required when rejecting",
          code: "INVALID_REFERENCE_EQUIPMENT_APPROVAL_DECISION",
        });
      }
      await prisma.jobReferenceEquipmentApproval.update({
        where: { id: approvalId },
        data: {
          status: "REJECTED",
          decision: "REJECT",
          decisionNote: input.decisionNote ?? null,
          decidedByUserId: userId,
          decidedAt,
        },
      });
      return this.getReferenceEquipmentApproval(companyId, jobId, approvalId);
    }

    const required = approval.items.filter((item) => item.requiresOverride);
    const reasons = new Map((input.items ?? []).map((item) => [item.equipmentId, item.overrideReason]));
    for (const item of required) {
      if (!reasons.get(item.equipmentId)) {
        throw new BadRequestException({
          message: "Override reasons are required for every invalid line when approving",
          code: "INVALID_REFERENCE_EQUIPMENT_APPROVAL_DECISION",
          equipmentId: item.equipmentId,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobReferenceEquipmentApproval.update({
        where: { id: approvalId },
        data: {
          status: "APPROVED",
          decision: "APPROVE",
          decisionNote: input.decisionNote ?? null,
          decidedByUserId: userId,
          decidedAt,
        },
      });
      for (const item of required) {
        const reason = reasons.get(item.equipmentId)!;
        await tx.jobReferenceEquipmentApprovalItem.update({
          where: { id: item.id },
          data: { overrideReason: reason },
        });
        await tx.jobReferenceEquipmentUsed.update({
          where: {
            calibrationJobId_equipmentId: {
              calibrationJobId: jobId,
              equipmentId: item.equipmentId,
            },
          },
          data: {
            validityOverridden: true,
            overrideReason: reason,
            overriddenByUserId: userId,
            overriddenAt: decidedAt,
          },
        });
      }
    });

    return this.getReferenceEquipmentApproval(companyId, jobId, approvalId);
  }

  private async getReferenceEquipmentApproval(
    companyId: string,
    jobId: string,
    approvalId: string,
  ): Promise<JobReferenceEquipmentApprovalDetail> {
    const approval = await prisma.jobReferenceEquipmentApproval.findFirst({
      where: { id: approvalId, companyId, calibrationJobId: jobId },
      include: jobReferenceEquipmentApprovalInclude,
    });
    if (!approval) {
      throw new NotFoundException({
        message: "Reference equipment approval not found",
        code: "REFERENCE_EQUIPMENT_APPROVAL_NOT_FOUND",
      });
    }
    return approval;
  }

  private async findPendingReferenceEquipmentApproval(
    jobId: string,
  ): Promise<{ id: string } | null> {
    return prisma.jobReferenceEquipmentApproval.findFirst({
      where: { calibrationJobId: jobId, status: "PENDING_REVIEW" },
      select: { id: true },
    });
  }

  /**
   * submitForReview prerequisite: eligible worksheet parameters for the current
   * attempt are complete. Pattern A/B comes from JobCalibrationTestPoint only
   * (live catalog must not expand a started job). Physical checks are not gated.
   *
   * Phase 4B (Gap B): deliberately DOES NOT include DERIVED here — it stays
   * DIRECT_REPLICATES-only, unchanged from before this phase. A DERIVED value
   * is enterable (see listMeasurementParameters) but optional at submit; Report
   * 08 §9.B.7 leaves "should a derived value gate submit?" as an open business
   * question, so the safe default is to require nothing new.
   */
  private async assertMeasurementsCompleteForSubmit(
    companyId: string,
    job: CalibrationJobDetail,
  ): Promise<void> {
    const deviceTypeId = this.resolveJobDeviceTypeId(job);
    if (deviceTypeId === null) return;

    const excluded = new Set<string>(MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES);
    const [eligible, snapshotRows, results] = await Promise.all([
      prisma.deviceCalibrationParameter.findMany({
        where: {
          deviceTypeId,
          isActive: true,
          valueType: "NUMBER",
          entryStyle: "DIRECT_REPLICATES",
        },
        select: { id: true, code: true },
      }),
      prisma.jobCalibrationTestPoint.findMany({
        where: { calibrationJobId: job.id },
        select: {
          deviceCalibrationParameterId: true,
          sourceCalibrationTestPointId: true,
        },
      }),
      prisma.measurementResult.findMany({
        where: {
          companyId,
          calibrationJobId: job.id,
          attemptNumber: job.currentAttempt,
        },
        select: {
          deviceCalibrationParameterId: true,
          calibrationTestPointId: true,
          measuredValue: true,
          measuredText: true,
        },
      }),
    ]);

    const eligibleParameterIds = eligible.filter((row) => !excluded.has(row.code)).map((row) => row.id);
    const verdict = evaluateMeasurementCompleteness({
      eligibleParameterIds,
      snapshotRows,
      results,
    });
    if (verdict.complete) return;

    throw new BadRequestException({
      message: "Measurement results are incomplete for this attempt",
      code: CALIBRATION_MEASUREMENTS_INCOMPLETE,
      details: { parameters: verdict.parameters },
    });
  }

  /**
   * submitForReview prerequisite (MoM #6): no IdentityCorrection is still
   * awaiting a TECHNICIAN_MANAGER decision. A pending BA never blocks bench
   * work — only the handover to quality review — because after SUBMITTED the
   * identity gate closes and the BA could never be decided at all.
   *
   * Deliberately NOT assertIdentityGateOpen(): that answers "has the job left
   * the bench?", which is the opposite question.
   */
  private async assertNoPendingIdentityCorrectionForSubmit(
    companyId: string,
    jobId: string,
  ): Promise<void> {
    const pending = await prisma.identityCorrection.findFirst({
      where: { companyId, calibrationJobId: jobId, status: "PENDING_REVIEW" },
      select: { id: true, number: true },
    });
    if (pending) {
      throw new ConflictException({
        message:
          "Calibration job has a pending Identity Correction that must be approved or rejected before submission",
        code: IDENTITY_CORRECTION_UNRESOLVED,
        correctionId: pending.id,
        number: pending.number,
      });
    }
  }

  /**
   * submitForReview prerequisite: no PENDING approval, and no *selected* used
   * row that is currently invalid without an override. Unselected WO units
   * do not count.
   */
  private async assertReferenceEquipmentResolvedForSubmit(
    companyId: string,
    jobId: string,
  ): Promise<void> {
    const pending = await this.findPendingReferenceEquipmentApproval(jobId);
    if (pending) {
      throw new ConflictException({
        message: "Resolve the pending reference-equipment approval before submitting results",
        code: "REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED",
        approvalId: pending.id,
      });
    }

    const job = await this.loadReferenceEquipmentSource(companyId, jobId);
    const used = await prisma.jobReferenceEquipmentUsed.findMany({
      where: { calibrationJobId: jobId },
    });
    const asOf = job.startedAt ?? new Date();
    const unresolved = used.find((row) => usedRowRequiresOverride(row, job, asOf).requiresOverride);
    if (unresolved) {
      throw new ConflictException({
        message: "Selected invalid reference equipment must be approved before submitting results",
        code: "REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED",
        equipmentId: unresolved.equipmentId,
      });
    }
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
