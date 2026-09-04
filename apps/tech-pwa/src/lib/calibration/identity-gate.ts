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
