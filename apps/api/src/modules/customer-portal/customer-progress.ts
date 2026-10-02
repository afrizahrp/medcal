import { createHash } from "node:crypto";
import type { CalibrationJobStatus, WorkOrderStatus } from "@medcal/db";

/**
 * Customer-facing view of calibration execution. Internal workflow names
 * (PENDING, SUBMITTED, REWORK, ACCEPTED_BY_QA) never leave this module.
 *
 * Completed means CalibrationJob.status = ACCEPTED_BY_QA. Certificate
 * issuance is not an input to this function.
 */
export type CustomerJobStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

/** Customer-facing Work Order status. PLANNED and ASSIGNED are both "not started". */
export type CustomerWorkOrderStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type CustomerCertificateAvailability = "UNAVAILABLE" | "AVAILABLE" | "ISSUED_WITHOUT_PDF";

export interface CustomerProgress {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  /** Integer 0–100. Zero when total is not a positive finite number. */
  percentage: number;
}

export interface CustomerCertificateView {
  availability: CustomerCertificateAvailability;
  number: string | null;
  issuedAt: Date | null;
}

export function customerJobStatus(status: CalibrationJobStatus): CustomerJobStatus {
  switch (status) {
    case "PENDING":
      return "NOT_STARTED";
    case "IN_PROGRESS":
    case "SUBMITTED":
    case "REWORK":
      return "IN_PROGRESS";
    case "ACCEPTED_BY_QA":
      return "COMPLETED";
  }
}

export function customerWorkOrderStatus(status: WorkOrderStatus): CustomerWorkOrderStatus {
  switch (status) {
    case "PLANNED":
    case "ASSIGNED":
      return "NOT_STARTED";
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    case "DONE":
    case "TECHNICALLY_DONE":
    case "CLOSED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
  }
}

/**
 * Inverse of customerJobStatus / customerWorkOrderStatus, used to turn a
 * customer-facing filter value back into the internal statuses to query. Typed
 * as a Record over the customer union so a new customer status cannot be added
 * without deciding what it filters.
 */
export const JOB_STATUSES_BY_CUSTOMER_STATUS: Record<CustomerJobStatus, readonly CalibrationJobStatus[]> = {
  NOT_STARTED: ["PENDING"],
  IN_PROGRESS: ["IN_PROGRESS", "SUBMITTED", "REWORK"],
  COMPLETED: ["ACCEPTED_BY_QA"],
};

export const WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS: Record<
  CustomerWorkOrderStatus,
  readonly WorkOrderStatus[]
> = {
  NOT_STARTED: ["PLANNED", "ASSIGNED"],
  IN_PROGRESS: ["IN_PROGRESS"],
  COMPLETED: ["DONE", "TECHNICALLY_DONE", "CLOSED"],
  CANCELLED: ["CANCELLED"],
};

/** How much of a Work Order is finished. Nothing to divide by counts as "none". */
export type CustomerProgressBucket = "NONE_COMPLETED" | "PARTIALLY_COMPLETED" | "ALL_COMPLETED";

export function progressBucket(completed: number, total: number): CustomerProgressBucket {
  if (!(total > 0) || !(completed > 0)) return "NONE_COMPLETED";
  return completed >= total ? "ALL_COMPLETED" : "PARTIALLY_COMPLETED";
}

export function progressPercentage(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(completed)) return 0;
  return Math.round((completed / total) * 100);
}

/** Job count per internal status, as produced by a groupBy over a Work Order's jobs. */
export type JobStatusCounts = Partial<Record<CalibrationJobStatus, number>>;

/**
 * Before fan-out there are no CalibrationJob rows, so the denominator is the
 * Work Order's own item quantity (never the PO quantity — one PO can have
 * many Work Orders). Once any job exists, the denominator is the job count.
 */
export function computeCustomerProgress(input: {
  itemQtyTotal: number;
  statusCounts: JobStatusCounts;
}): CustomerProgress {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  for (const [status, count] of Object.entries(input.statusCounts) as Array<
    [CalibrationJobStatus, number]
  >) {
    const customerStatus = customerJobStatus(status);
    if (customerStatus === "COMPLETED") completed += count;
    else if (customerStatus === "NOT_STARTED") notStarted += count;
    else inProgress += count;
  }
  const total = completed + inProgress + notStarted;

  if (total === 0) {
    const planned =
      Number.isFinite(input.itemQtyTotal) && input.itemQtyTotal > 0 ? input.itemQtyTotal : 0;
    return { total: planned, completed: 0, inProgress: 0, notStarted: planned, percentage: 0 };
  }

  return {
    total,
    completed,
    inProgress,
    notStarted,
    percentage: progressPercentage(completed, total),
  };
}

/**
 * Certificate availability is per job and independent of job completion.
 * A non-ISSUED row (including a legacy DRAFT) is not a customer-facing certificate.
 */
export function toCertificateView(
  certificate: {
    status: string;
    number: string;
    issuedAt: Date | null;
    pdfFileObjectId: string | null;
  } | null,
): CustomerCertificateView {
  if (!certificate || certificate.status !== "ISSUED") {
    return { availability: "UNAVAILABLE", number: null, issuedAt: null };
  }
  if (!certificate.pdfFileObjectId) {
    return {
      availability: "ISSUED_WITHOUT_PDF",
      number: certificate.number,
      issuedAt: certificate.issuedAt,
    };
  }
  return {
    availability: "AVAILABLE",
    number: certificate.number,
    issuedAt: certificate.issuedAt,
  };
}

/**
 * What identifies one unit to the customer who owns it. Prefers the customer's
 * own wording for the device, then what the technician confirmed on-site, then
 * the device master. Internal ids, the device code and AKD/AKL numbers stay out.
 */
export interface CustomerUnitIdentity {
  name: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function toUnitIdentity(job: {
  customerDeclaredDeviceName: string | null;
  technicianObservedBrand: string | null;
  technicianObservedModel: string | null;
  technicianObservedSerial: string | null;
  device: {
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    deviceType: { name: string };
  } | null;
}): CustomerUnitIdentity {
  return {
    name: clean(job.customerDeclaredDeviceName) ?? clean(job.device?.deviceType.name),
    brand: clean(job.technicianObservedBrand) ?? clean(job.device?.brand),
    model: clean(job.technicianObservedModel) ?? clean(job.device?.model),
    serialNumber: clean(job.technicianObservedSerial) ?? clean(job.device?.serialNumber),
  };
}

/**
 * Opaque, stable key for one order line of one Work Order. Units are grouped by
 * order line (PurchaseOrderItem), but that id is internal and never leaves the
 * server: the client only ever sees and returns this one-way hash, and it can
 * only be resolved inside a Work Order the caller already owns. Units with no
 * order line form one group of their own.
 */
export function unitGroupKey(workOrderId: string, purchaseOrderItemId: string | null): string {
  return createHash("sha256")
    .update(`unit-group:${workOrderId}:${purchaseOrderItemId === null ? "no-line" : `line:${purchaseOrderItemId}`}`)
    .digest("base64url")
    .slice(0, 22);
}

/** Header counts for a group of units, from the per-status job counts. */
export function summarizeGroupCounts(statusCounts: JobStatusCounts): {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
} {
  const { total, completed, inProgress, notStarted } = computeCustomerProgress({
    itemQtyTotal: 0,
    statusCounts,
  });
  return { total, completed, inProgress, notStarted };
}
