/**
 * Per-job "needs action" signals for the Calibration Jobs list.
 *
 * Extensible by design: adding a phase (MeasurementResult review, Certificate
 * review, …) is a new boolean key on `CalibrationJobActionSignals` plus its
 * server-side computation and a child-row badge — the counting / aggregation
 * helpers below take an open `Record<string, boolean>` and never change.
 *
 * Contract: every `true` value MUST be actionable right now given the job's
 * lifecycle. Informational facts (e.g. incomplete identity after the identity
 * gate has locked) must NOT appear as active signals — they inflate
 * "N perlu tindakan" without a corresponding action on the detail page.
 */

/** Job statuses past the bench — identity + reference-equipment gates close. */
export const CALIBRATION_JOB_BENCH_LOCKED_STATUSES = ["SUBMITTED", "ACCEPTED_BY_QA"] as const;

export type CalibrationJobActionSignals = {
  /** An Identity Correction BA on this job is PENDING_REVIEW and still decidable. */
  identityCorrectionPending: boolean;
  /**
   * ≥1 confirmed reference-equipment unit is invalid and not yet overridden,
   * and the reference-equipment gate is still open.
   */
  referenceEquipmentNeedsApproval: boolean;
  /**
   * After technician work has started (`startedAt` set), the confirmed job
   * identity is still missing Device ID and/or observed Serial — AND an
   * identity correction can still be submitted (gate open). Does not block
   * calibration, BA, or quality review.
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

/** True once the job has advanced past the bench (identity gate closed). */
export function isCalibrationJobBenchLocked(status: string): boolean {
  return (CALIBRATION_JOB_BENCH_LOCKED_STATUSES as readonly string[]).includes(status);
}

/**
 * Pure factual predicate: Device ID and/or observed Serial missing after start.
 * AKD/AKL intentionally excluded — separate gate. Does NOT consider lifecycle
 * lock; use `buildCalibrationJobActionSignals` for the actionable list signal.
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

export type BuildCalibrationJobActionSignalsInput = {
  status: string;
  startedAt: Date | string | null;
  deviceId: string | null;
  technicianObservedSerial: string | null;
  /** Raw: latest Identity Correction BA is PENDING_REVIEW (any job status). */
  hasPendingIdentityCorrection: boolean;
  /** Raw: ≥1 confirmed ref-equipment unit needs override (any job status). */
  needsReferenceEquipmentApproval: boolean;
};

/**
 * Builds the actionable signal map. Lifecycle-locked jobs suppress signals
 * whose remediation is no longer available — so list aggregates and detail
 * CTAs stay aligned.
 */
export function buildCalibrationJobActionSignals(
  input: BuildCalibrationJobActionSignalsInput,
): CalibrationJobActionSignals {
  const locked = isCalibrationJobBenchLocked(input.status);
  return {
    identityCorrectionPending: input.hasPendingIdentityCorrection && !locked,
    referenceEquipmentNeedsApproval: input.needsReferenceEquipmentApproval && !locked,
    identityIncomplete: isIdentityIncomplete(input) && !locked,
  };
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
