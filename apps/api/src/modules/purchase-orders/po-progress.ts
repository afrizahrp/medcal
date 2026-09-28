import { NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import {
  MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES,
  evaluateMeasurementCompleteness,
} from "../calibration-jobs/measurement-completeness";
import { computeRemainingQtyByItemId } from "../work-orders/allocation";

/**
 * Allocation & Multi-WOL Architecture (Phase 9 — PO Progress).
 * See docs/audits/final-po-allocation-wol-spk-architecture-decision.md §16.
 *
 * The 8 locked buckets, and EXACTLY how each maps onto existing, unmodified
 * state (no new CalibrationJob status, no new Certificate state, no new
 * lifecycle):
 *
 *  1. unallocated          — PurchaseOrderItem.qty - SUM(ACTIVE allocation qty)
 *                             (derived via the existing, unmodified
 *                             computeRemainingQtyByItemId — same source of
 *                             truth the allocation-aware create() path uses).
 *  2. allocatedNotStarted  — TWO sub-cases, both meaning "committed, zero
 *                             execution work begun":
 *                               a) an ACTIVE allocation whose WorkOrder is
 *                                  still PLANNED/ASSIGNED (fan-out hasn't run
 *                                  — no CalibrationJob exists yet for it);
 *                               b) a CalibrationJob that HAS been fanned out
 *                                  but is still PENDING (the WorkOrder
 *                                  started, but this specific unit hasn't).
 *                             The locked architecture's own worked example
 *                             only names case (a); PENDING has no bucket of
 *                             its own in the 8-item list, so it is mapped
 *                             here as the closest fit — documented, not
 *                             invented, per Phase 9's explicit instruction
 *                             to map existing states onto the 8 buckets
 *                             rather than add a 9th.
 *  3. inProgress           — CalibrationJob.status IN (IN_PROGRESS, REWORK)
 *                             whose measurement is NOT yet complete. REWORK
 *                             is mapped here (not to "submitted" or
 *                             "qaAccepted") because MT rejected it and the
 *                             technician is actively re-working it — the
 *                             same operational state as IN_PROGRESS from a
 *                             PO-progress standpoint.
 *  4. measurementComplete  — CalibrationJob.status IN (IN_PROGRESS, REWORK)
 *                             whose measurement completeness check (the same
 *                             pure evaluateMeasurementCompleteness function
 *                             submitForReview itself uses) already passes,
 *                             but the technician hasn't submitted yet.
 *  5. submitted            — CalibrationJob.status = SUBMITTED.
 *  6. qaAccepted           — CalibrationJob.status = ACCEPTED_BY_QA with NO
 *                             ISSUED Certificate yet.
 *  7. certificateIssued    — CalibrationJob.status = ACCEPTED_BY_QA WITH an
 *                             ISSUED Certificate.
 *  8. cancelled            — CalibrationJob rows whose WorkOrder is
 *                             CANCELLED. Reported SEPARATELY — see below.
 *
 * CRITICAL: buckets 1–7 sum to the PO's total ordered quantity; bucket 8 does
 * NOT participate in that sum. This is a direct, deliberate consequence of
 * the locked cancellation semantics (Allocation cancellation clarification):
 * a cancelled WorkOrder's Allocation is released back to "remaining"
 * regardless of fan-out state, so its quantity is ALREADY counted — either
 * back in `unallocated` (if not yet reallocated) or under whichever new
 * WorkOrder now holds an ACTIVE allocation for it (Scenario B/C in the Phase
 * 9 brief). The orphaned jobs under the cancelled WorkOrder are never
 * double-counted; `cancelled` is a separate, informational tally only.
 */

export interface PoProgressBuckets {
  unallocated: number;
  allocatedNotStarted: number;
  inProgress: number;
  measurementComplete: number;
  submitted: number;
  qaAccepted: number;
  certificateIssued: number;
  /** Informational only — excluded from the totalQty sum. See module doc. */
  cancelled: number;
}

export interface PoProgressResult {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  totalQty: number;
  buckets: PoProgressBuckets;
  /**
   * Locked completion predicate (final architecture decision §16, §22):
   * zero unallocated AND every relevant (non-cancelled-WorkOrder) job is
   * ACCEPTED_BY_QA AND every one of those has an ISSUED Certificate. A PO
   * with no active items/allocations at all is never "complete" (there is
   * nothing to have completed) — a conservative default, documented here,
   * not silently assumed.
   */
  isComplete: boolean;
}

const ACTIVE_JOB_STATUSES = ["IN_PROGRESS", "REWORK"] as const;

export async function computePoProgress(
  companyId: string,
  purchaseOrderId: string,
): Promise<PoProgressResult> {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, companyId },
    select: {
      id: true,
      number: true,
      items: {
        where: { status: { not: "CANCELLED" } },
        select: { id: true, qty: true },
      },
    },
  });
  if (!purchaseOrder) {
    throw new NotFoundException({
      message: "Purchase order not found",
      code: "PURCHASE_ORDER_NOT_FOUND",
    });
  }

  const itemsById = new Map(purchaseOrder.items.map((item) => [item.id, { qty: item.qty }]));
  const itemIds = [...itemsById.keys()];
  const totalQty = purchaseOrder.items.reduce(
    (sum, item) => sum.plus(item.qty),
    new Prisma.Decimal(0),
  );

  // Bucket 1 — reuses the EXACT source of truth the allocation-aware
  // WorkOrder.create() path uses. Never a second, divergent calculation.
  const remainingByItemId = await computeRemainingQtyByItemId(prisma, itemsById);
  const unallocated = itemIds
    .reduce((sum, id) => sum.plus(remainingByItemId.get(id) ?? itemsById.get(id)!.qty), new Prisma.Decimal(0))
    .toNumber();

  // Bucket 2, case (a) — ACTIVE allocations whose WorkOrder hasn't fanned
  // out yet (no CalibrationJob exists for them). Bounded by (item count ×
  // WorkOrder count) for this one PO — never company-wide.
  const activeAllocations =
    itemIds.length === 0
      ? []
      : await prisma.purchaseOrderItemAllocation.findMany({
          where: { purchaseOrderItemId: { in: itemIds }, status: "ACTIVE" },
          select: { qty: true, workOrder: { select: { status: true } } },
        });
  const allocatedNotStartedFromPreFanOut = activeAllocations
    .filter((row) => row.workOrder.status === "PLANNED" || row.workOrder.status === "ASSIGNED")
    .reduce((sum, row) => sum.plus(row.qty), new Prisma.Decimal(0));

  // Every WorkOrder for this PO, split cancelled vs not — bounded by however
  // many WorkOrders this one PO has (never company-wide).
  const workOrders = await prisma.workOrder.findMany({
    where: { purchaseOrderId, companyId },
    select: { id: true, status: true },
  });
  const nonCancelledWorkOrderIds = workOrders
    .filter((wo) => wo.status !== "CANCELLED")
    .map((wo) => wo.id);
  const cancelledWorkOrderIds = workOrders
    .filter((wo) => wo.status === "CANCELLED")
    .map((wo) => wo.id);

  // One cheap groupBy for the flat-status buckets (PENDING/SUBMITTED), never
  // loading full job rows for these. Bounded by this PO's own WorkOrders.
  const statusCounts =
    nonCancelledWorkOrderIds.length === 0
      ? []
      : await prisma.calibrationJob.groupBy({
          by: ["status"],
          where: { workOrderId: { in: nonCancelledWorkOrderIds } },
          _count: { _all: true },
        });
  const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const pendingCount = countByStatus.get("PENDING") ?? 0;
  const submitted = countByStatus.get("SUBMITTED") ?? 0;

  // Bucket 3/4 split requires per-job measurement-completeness (the same
  // pure, unmodified evaluateMeasurementCompleteness used by
  // submitForReview) — but only for the CURRENTLY in-progress/rework subset
  // of THIS PO, never company-wide, and batched (3 queries total,
  // regardless of how many such jobs exist) rather than one query per job.
  const activeJobs =
    nonCancelledWorkOrderIds.length === 0
      ? []
      : await prisma.calibrationJob.findMany({
          where: {
            workOrderId: { in: nonCancelledWorkOrderIds },
            status: { in: [...ACTIVE_JOB_STATUSES] },
          },
          select: {
            id: true,
            currentAttempt: true,
            calibrationRequestItem: { select: { deviceTypeId: true } },
            purchaseOrderItem: {
              select: { quotationItem: { select: { requestItem: { select: { deviceTypeId: true } } } } },
            },
          },
        });

  let inProgress = 0;
  let measurementComplete = 0;
  if (activeJobs.length > 0) {
    const deviceTypeIdByJobId = new Map<string, string | null>();
    for (const job of activeJobs) {
      const deviceTypeId =
        job.calibrationRequestItem?.deviceTypeId ??
        job.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
        null;
      deviceTypeIdByJobId.set(job.id, deviceTypeId);
    }
    const uniqueDeviceTypeIds = [...new Set([...deviceTypeIdByJobId.values()].filter((id): id is string => id !== null))];
    const jobIds = activeJobs.map((job) => job.id);

    const [parametersByDeviceType, snapshotRowsByJobId, resultsByJobId] = await Promise.all([
      uniqueDeviceTypeIds.length === 0
        ? Promise.resolve([])
        : prisma.deviceCalibrationParameter.findMany({
            where: {
              deviceTypeId: { in: uniqueDeviceTypeIds },
              isActive: true,
              valueType: "NUMBER",
              entryStyle: "DIRECT_REPLICATES",
            },
            select: { id: true, code: true, deviceTypeId: true },
          }),
        prisma.jobCalibrationTestPoint.findMany({
          where: { calibrationJobId: { in: jobIds } },
          select: {
            calibrationJobId: true,
            deviceCalibrationParameterId: true,
            sourceCalibrationTestPointId: true,
            excludedAt: true,
          },
        }),
        prisma.measurementResult.findMany({
          where: { companyId, calibrationJobId: { in: jobIds } },
          select: {
            calibrationJobId: true,
            attemptNumber: true,
            deviceCalibrationParameterId: true,
            calibrationTestPointId: true,
            measuredValue: true,
            measuredText: true,
          },
        }),
    ]);

    const excluded = new Set<string>(MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES);
    const parametersByDeviceTypeMap = new Map<string, { id: string; code: string }[]>();
    for (const row of parametersByDeviceType) {
      const list = parametersByDeviceTypeMap.get(row.deviceTypeId) ?? [];
      list.push({ id: row.id, code: row.code });
      parametersByDeviceTypeMap.set(row.deviceTypeId, list);
    }
    const snapshotByJobId = new Map<string, typeof snapshotRowsByJobId>();
    for (const row of snapshotRowsByJobId) {
      const list = snapshotByJobId.get(row.calibrationJobId) ?? [];
      list.push(row);
      snapshotByJobId.set(row.calibrationJobId, list);
    }
    const resultsByJobIdMap = new Map<string, typeof resultsByJobId>();
    for (const row of resultsByJobId) {
      const list = resultsByJobIdMap.get(row.calibrationJobId) ?? [];
      list.push(row);
      resultsByJobIdMap.set(row.calibrationJobId, list);
    }

    for (const job of activeJobs) {
      const deviceTypeId = deviceTypeIdByJobId.get(job.id) ?? null;
      if (deviceTypeId === null) {
        // Mirrors resolveJobDeviceTypeId's own null case (submitForReview
        // has nothing to validate against) — treat as not measurement-complete.
        inProgress += 1;
        continue;
      }
      const eligibleParameterIds = (parametersByDeviceTypeMap.get(deviceTypeId) ?? [])
        .filter((row) => !excluded.has(row.code))
        .map((row) => row.id);
      const snapshotRows = snapshotByJobId.get(job.id) ?? [];
      const results = (resultsByJobIdMap.get(job.id) ?? []).filter(
        (row) => row.attemptNumber === job.currentAttempt,
      );
      const frozenPatternBParameterIds = [
        ...new Set(snapshotRows.map((row) => row.deviceCalibrationParameterId)),
      ];
      const verdict = evaluateMeasurementCompleteness({
        eligibleParameterIds,
        snapshotRows: snapshotRows
          .filter((row) => row.excludedAt == null)
          .map((row) => ({
            deviceCalibrationParameterId: row.deviceCalibrationParameterId,
            sourceCalibrationTestPointId: row.sourceCalibrationTestPointId,
          })),
        frozenPatternBParameterIds,
        results,
      });
      if (verdict.complete) measurementComplete += 1;
      else inProgress += 1;
    }
  }

  // Bucket 6/7 split — one bounded findMany + one bounded count, never
  // company-wide, never per-job.
  const acceptedJobs =
    nonCancelledWorkOrderIds.length === 0
      ? []
      : await prisma.calibrationJob.findMany({
          where: { workOrderId: { in: nonCancelledWorkOrderIds }, status: "ACCEPTED_BY_QA" },
          select: { id: true },
        });
  const issuedCertificateCount =
    acceptedJobs.length === 0
      ? 0
      : await prisma.certificate.count({
          where: {
            calibrationJobId: { in: acceptedJobs.map((job) => job.id) },
            status: "ISSUED",
          },
        });
  const qaAccepted = acceptedJobs.length - issuedCertificateCount;
  const certificateIssued = issuedCertificateCount;

  // Bucket 8 — informational only, never summed into totalQty (see module doc).
  const cancelled =
    cancelledWorkOrderIds.length === 0
      ? 0
      : await prisma.calibrationJob.count({ where: { workOrderId: { in: cancelledWorkOrderIds } } });

  const allocatedNotStarted = allocatedNotStartedFromPreFanOut.toNumber() + pendingCount;

  const buckets: PoProgressBuckets = {
    unallocated,
    allocatedNotStarted,
    inProgress,
    measurementComplete,
    submitted,
    qaAccepted,
    certificateIssued,
    cancelled,
  };

  const isComplete =
    totalQty.greaterThan(0) &&
    unallocated === 0 &&
    allocatedNotStarted === 0 &&
    inProgress === 0 &&
    measurementComplete === 0 &&
    submitted === 0 &&
    qaAccepted === 0 &&
    certificateIssued > 0;

  return {
    purchaseOrderId: purchaseOrder.id,
    purchaseOrderNumber: purchaseOrder.number,
    totalQty: totalQty.toNumber(),
    buckets,
    isComplete,
  };
}
