import { describe, expect, it } from "vitest";
import {
  canCompleteJob,
  canResumeAfterRework,
  canShowResumeAfterRework,
  canSubmitForReview,
  isAwaitingQualityReview,
  isQualityReviewApproved,
  isQualityReviewRejected,
  latestQualityReview,
  shouldShowRejectionFeedback,
} from "./quality-review";
import type { TechQualityReview } from "./types";

const approved: TechQualityReview = {
  id: "qr-1",
  status: "APPROVED",
  decision: "APPROVE",
  notes: "OK",
  reviewerUserId: "mt-1",
  reviewedAt: "2026-09-09T00:00:00.000Z",
  createdAt: "2026-09-09T00:00:00.000Z",
  reviewer: { id: "mt-1", name: "MT" },
};

const rejected: TechQualityReview = {
  ...approved,
  id: "qr-2",
  status: "REJECTED",
  decision: "REJECT",
  notes: "NIBP perlu diukur ulang",
};

describe("quality-review helpers", () => {
  it("reads reviews[0] as the latest QualityReview", () => {
    expect(latestQualityReview({ status: "SUBMITTED", reviews: [approved] })).toEqual(approved);
    expect(latestQualityReview({ status: "SUBMITTED", reviews: [] })).toBeNull();
    expect(latestQualityReview({ status: "SUBMITTED" })).toBeNull();
  });

  it("treats SUBMITTED without APPROVED as waiting for MT", () => {
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [] })).toBe(true);
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
    expect(isAwaitingQualityReview({ status: "IN_PROGRESS", reviews: [] })).toBe(false);
    expect(isQualityReviewApproved({ status: "SUBMITTED", reviews: [approved] })).toBe(true);
  });

  it("allows submit only while IN_PROGRESS after start", () => {
    expect(canSubmitForReview({ status: "IN_PROGRESS", startedAt: "2026-09-09T00:00:00.000Z" })).toBe(
      true,
    );
    expect(canSubmitForReview({ status: "IN_PROGRESS", startedAt: null })).toBe(false);
    expect(canSubmitForReview({ status: "PENDING", startedAt: null })).toBe(false);
    expect(canSubmitForReview({ status: "SUBMITTED", startedAt: "2026-09-09T00:00:00.000Z" })).toBe(
      false,
    );
  });

  it("allows complete only when SUBMITTED and latest review is APPROVED", () => {
    expect(canCompleteJob({ status: "SUBMITTED", reviews: [approved] })).toBe(true);
    expect(canCompleteJob({ status: "SUBMITTED", reviews: [] })).toBe(false);
    expect(canCompleteJob({ status: "ACCEPTED_BY_QA", reviews: [approved] })).toBe(false);
    expect(canCompleteJob({ status: "IN_PROGRESS", reviews: [approved] })).toBe(false);
  });

  it("treats SUBMITTED + latest REJECTED as awaiting the current cycle, not an active rejection", () => {
    const job = { status: "SUBMITTED" as const, reviews: [rejected] };
    expect(isAwaitingQualityReview(job)).toBe(true);
    expect(isQualityReviewRejected(job)).toBe(true);
    expect(shouldShowRejectionFeedback(job)).toBe(false);
    expect(canCompleteJob(job)).toBe(false);
    expect(canResumeAfterRework(job)).toBe(false);
  });

  it("shows rejection notes on REWORK and IN_PROGRESS, not as awaiting review", () => {
    expect(shouldShowRejectionFeedback({ status: "REWORK", reviews: [rejected] })).toBe(true);
    expect(isAwaitingQualityReview({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(canCompleteJob({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(canSubmitForReview({ status: "REWORK", startedAt: "2026-09-09T00:00:00.000Z" })).toBe(
      false,
    );
    expect(canResumeAfterRework({ status: "REWORK" })).toBe(true);
    expect(shouldShowRejectionFeedback({ status: "IN_PROGRESS", reviews: [rejected] })).toBe(true);
    expect(canResumeAfterRework({ status: "IN_PROGRESS" })).toBe(false);
  });

  it("shows Resume only when the job is REWORK and the resume capability is true", () => {
    expect(canShowResumeAfterRework({ status: "REWORK" }, true)).toBe(true);
    expect(canShowResumeAfterRework({ status: "REWORK" }, false)).toBe(false);
    expect(canShowResumeAfterRework({ status: "IN_PROGRESS" }, true)).toBe(false);
    expect(canShowResumeAfterRework({ status: "SUBMITTED" }, true)).toBe(false);
    expect(canShowResumeAfterRework({ status: "PENDING" }, true)).toBe(false);
    expect(canShowResumeAfterRework({ status: "ACCEPTED_BY_QA" }, true)).toBe(false);
  });

  it("does not show rejection feedback on APPROVED or ACCEPTED_BY_QA", () => {
    expect(shouldShowRejectionFeedback({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
    expect(shouldShowRejectionFeedback({ status: "ACCEPTED_BY_QA", reviews: [approved] })).toBe(
      false,
    );
    expect(canResumeAfterRework({ status: "ACCEPTED_BY_QA" })).toBe(false);
    expect(canCompleteJob({ status: "ACCEPTED_BY_QA", reviews: [approved] })).toBe(false);
    expect(isAwaitingQualityReview({ status: "ACCEPTED_BY_QA", reviews: [approved] })).toBe(false);
  });

  it("keeps Selesai on SUBMITTED + APPROVED and restores Kirim after resume to IN_PROGRESS", () => {
    expect(canCompleteJob({ status: "SUBMITTED", reviews: [approved] })).toBe(true);
    expect(canShowResumeAfterRework({ status: "SUBMITTED" }, true)).toBe(false);
    expect(canSubmitForReview({ status: "IN_PROGRESS", startedAt: "2026-09-09T00:00:00.000Z" })).toBe(
      true,
    );
    expect(canShowResumeAfterRework({ status: "IN_PROGRESS" }, true)).toBe(false);
    expect(canCompleteJob({ status: "IN_PROGRESS", reviews: [rejected] })).toBe(false);
  });
});
