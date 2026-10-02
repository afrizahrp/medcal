import type { WorkOrderStatus } from "@medcal/db";

/**
 * Shared ON_SITE SPK — pure derivations for a Parent SPK.
 *
 * A Parent has NO stored execution state or progress of its own: everything
 * here is derived from its Child SPKs (the only executable work items) at read
 * time, so the Parent can never compete with them as a source of truth.
 */

/** Derived (never persisted) status of a Parent SPK. Reuses existing WorkOrder states. */
export type SharedSpkDerivedStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface SpkProgress {
  /** Quantity of units allocated to the Child (Parent: sum over active Children). */
  total: number;
  /** Units whose CalibrationJob reached ACCEPTED_BY_QA — the existing "completed" definition. */
  completed: number;
  /** Integer 0–100, quantity-weighted. Zero when total is not positive. */
  percentage: number;
}

const PRE_START_STATUSES = new Set<string>(["PLANNED", "ASSIGNED"]);
const DONE_STATUSES = new Set<string>(["DONE", "TECHNICALLY_DONE", "CLOSED"]);

/**
 * A Child is revisable only while it has not started: PLANNED/ASSIGNED. Once
 * IN_PROGRESS (fan-out has run) it is execution-locked; DONE/CANCELLED are
 * terminal. This is the existing WorkOrder revise rule, applied per Child.
 */
export function isChildRevisableStatus(status: WorkOrderStatus): boolean {
  return PRE_START_STATUSES.has(status);
}

export function progressOf(total: number, completed: number): SpkProgress {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const percentage = safeTotal > 0 ? Math.min(100, Math.round((completed / safeTotal) * 100)) : 0;
  return { total: safeTotal, completed, percentage };
}

/**
 * Quantity-weighted aggregate (270/406), NOT an average of Child percentages.
 * CANCELLED Children are excluded: their allocation was released back to the PO
 * (existing allocation semantics), so their quantity is no longer part of the
 * shared job's committed scope.
 */
export function aggregateParentProgress(
  children: { status: WorkOrderStatus; progress: SpkProgress }[],
): SpkProgress {
  let total = 0;
  let completed = 0;
  for (const child of children) {
    if (child.status === "CANCELLED") continue;
    total += child.progress.total;
    completed += child.progress.completed;
  }
  return progressOf(total, completed);
}

export function deriveParentStatus(childStatuses: WorkOrderStatus[]): SharedSpkDerivedStatus {
  const active = childStatuses.filter((status) => status !== "CANCELLED");
  if (active.length === 0) return "CANCELLED";
  if (active.every((status) => DONE_STATUSES.has(status))) return "COMPLETED";
  if (active.every((status) => PRE_START_STATUSES.has(status))) return "NOT_STARTED";
  return "IN_PROGRESS";
}
