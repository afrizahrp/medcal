import type { CalibrationJobStatus, TechQualityReview } from "./types";

type JobWithReviews = {
  status: CalibrationJobStatus;
  reviews?: TechQualityReview[] | null;
};

type JobWithStart = {
  status: CalibrationJobStatus;
  startedAt: string | null;
};

/** Latest QualityReview from GET /calibration-jobs/:id → reviews[0]. */
export function latestQualityReview(job: JobWithReviews): TechQualityReview | null {
  return job.reviews?.[0] ?? null;
}

export function isQualityReviewApproved(job: JobWithReviews): boolean {
  return latestQualityReview(job)?.status === "APPROVED";
}

/** SUBMITTED and MT has not approved yet — waiting for review. */
export function isAwaitingQualityReview(job: JobWithReviews): boolean {
  return job.status === "SUBMITTED" && !isQualityReviewApproved(job);
}

/**
 * Technician submitForReview — IN_PROGRESS after start. Completeness / PASS-FAIL
 * are not gated here (backend does not require them on the happy path).
 */
export function canSubmitForReview(job: JobWithStart): boolean {
  return job.status === "IN_PROGRESS" && job.startedAt !== null;
}

/** Technician complete — only after MT APPROVED while the job is still SUBMITTED. */
export function canCompleteJob(job: JobWithReviews): boolean {
  return job.status === "SUBMITTED" && isQualityReviewApproved(job);
}
