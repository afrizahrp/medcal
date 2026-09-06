/**
 * Per-job "needs action" signals for the Calibration Jobs list.
 *
 * Extensible by design: adding a phase (MeasurementResult review, Certificate
 * review, …) is a new boolean key on `CalibrationJobActionSignals` plus its
 * server-side computation and a child-row badge — the counting / aggregation
 * helpers below take an open `Record<string, boolean>` and never change.
 */
export type CalibrationJobActionSignals = {
  /** An Identity Correction BA on this job is PENDING_REVIEW. */
  identityCorrectionPending: boolean;
  /** ≥1 confirmed reference-equipment unit is invalid and not yet overridden. */
  referenceEquipmentNeedsApproval: boolean;
  // Future signals slot in here — e.g. measurementSubmissionPending,
  // certificateReviewPending — without changing any consumer below.

  /** Open index so the map stays assignable to the generic signal helpers. */
  [signal: string]: boolean;
};

export const EMPTY_CALIBRATION_JOB_ACTION_SIGNALS: CalibrationJobActionSignals = {
  identityCorrectionPending: false,
  referenceEquipmentNeedsApproval: false,
};

/** Number of active signals in an arbitrary signal map. */
export function countActiveActionSignals(signals: Record<string, boolean>): number {
  return Object.values(signals).filter(Boolean).length;
}

/** True when a job carries at least one active signal. */
export function jobNeedsAction(signals: Record<string, boolean>): boolean {
  return countActiveActionSignals(signals) > 0;
}

/**
 * Parent (WorkOrder / SPK) aggregate badge label. `jobsNeedingAction` is the
 * count of child jobs with ≥1 active signal — computed server-side so the
 * collapsed parent row never needs child data. Returns null when nothing in the
 * group needs attention.
 */
export function actionBadgeLabel(jobsNeedingAction: number): string | null {
  return jobsNeedingAction > 0 ? `${jobsNeedingAction} perlu tindakan` : null;
}
