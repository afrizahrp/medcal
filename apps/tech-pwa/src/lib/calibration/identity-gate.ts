import type { AkdAklApprovalStatus, CalibrationJobStatus } from "./types";

/**
 * Mirrors IDENTITY_LOCKED_JOB_STATUSES in calibration-jobs.service.ts — once
 * the job has advanced past the bench, the identity gate closes server-side.
 */
const IDENTITY_LOCKED_JOB_STATUSES: readonly CalibrationJobStatus[] = ["SUBMITTED", "ACCEPTED_BY_QA"];

export function isIdentityGateLocked(job: { status: CalibrationJobStatus }): boolean {
  return IDENTITY_LOCKED_JOB_STATUSES.includes(job.status);
}

/** NOT_REQUIRED / REJECTED → PENDING_REVIEW is the only escalation transition. */
export function canEscalateIdentity(job: {
  status: CalibrationJobStatus;
  akdAklApprovalStatus: AkdAklApprovalStatus;
}): boolean {
  return (
    !isIdentityGateLocked(job) &&
    (job.akdAklApprovalStatus === "NOT_REQUIRED" || job.akdAklApprovalStatus === "REJECTED")
  );
}

/**
 * An identity correction BA can be submitted whenever the identity gate is open —
 * for first-time device resolution AND for correcting an already-bound identity.
 * A pending BA already existing is enforced server-side (IDENTITY_CORRECTION_ALREADY_PENDING).
 */
export function canSubmitIdentityCorrection(job: { status: CalibrationJobStatus }): boolean {
  return !isIdentityGateLocked(job);
}
