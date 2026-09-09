import { describe, expect, it } from "vitest";
import {
  canCompleteJob,
  canSubmitForReview,
  isAwaitingQualityReview,
  isQualityReviewApproved,
  latestQualityReview,
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
});
