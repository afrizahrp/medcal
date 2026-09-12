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
  /**
   * Warning only: after technician work has started (`startedAt` set), the
   * confirmed job identity is still missing Device ID and/or observed Serial.
   * Does not block calibration, BA, or quality review.
   */
  identityIncomplete: boolean;
  // Future signals slot in here — e.g. measurementSubmissionPending,
  // certificateReviewPending — without changing any consumer below.

  /** Open index so the map stays assignable to the generic signal helpers. */
  [signal: string]: boolean;
};

export const EMPTY_CALIBRATION_JOB_ACTION_SIGNALS: CalibrationJobActionSignals = {
  identityCorrectionPending: false,
  referenceEquipmentNeedsApproval: false,
  identityIncomplete: false,
};

/**
 * Pure predicate for `actionSignals.identityIncomplete`.
 *
 * Timing: only after technician work has started (`startedAt` set via
 * "Mulai Kalibrasi"). Newly fanned-out jobs with null identity must not warn.
 *
 * Completeness (AKD/AKL intentionally excluded — separate gate):
 *   Device ID present  → CalibrationJob.deviceId non-null
 *   Serial present     → technicianObservedSerial non-empty
 */
export function isIdentityIncomplete(job: {
  startedAt: Date | string | null;
  deviceId: string | null;
  technicianObservedSerial: string | null;
}): boolean {
  if (job.startedAt == null) return false;
  const serial = job.technicianObservedSerial?.trim() ?? "";
  return job.deviceId == null || serial.length === 0;
}

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
