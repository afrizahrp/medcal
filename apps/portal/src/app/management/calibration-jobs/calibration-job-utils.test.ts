import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  canDecideIdentity,
  canEscalateIdentity,
  canSubmitIdentityCorrection,
  canDecideQualityReview,
  correctionMissingImage,
  formatCalibrationJobApiError,
  isAwaitingQualityReview,
  isIdentityGateLocked,
  isQualityReviewApproved,
  qualityReviewDisplayAttempt,
  shouldShowRejectionFeedback,
  summarizeCorrectionChanges,
  toQualityReviewRejectInput,
} from "./calibration-job-utils";

const base = { status: "IN_PROGRESS", akdAklApprovalStatus: "NOT_REQUIRED" };

describe("calibration-job identity gate helpers", () => {
  it("allows escalation from NOT_REQUIRED and REJECTED only", () => {
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "NOT_REQUIRED" })).toBe(true);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "REJECTED" })).toBe(true);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "PENDING_REVIEW" })).toBe(false);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "APPROVED" })).toBe(false);
  });

  it("offers approve/reject only while PENDING_REVIEW", () => {
    expect(canDecideIdentity({ ...base, akdAklApprovalStatus: "PENDING_REVIEW" })).toBe(true);
    expect(canDecideIdentity({ ...base, akdAklApprovalStatus: "NOT_REQUIRED" })).toBe(false);
  });

  it("offers identity-correction submit whenever the gate is open", () => {
    expect(canSubmitIdentityCorrection({ status: "IN_PROGRESS" })).toBe(true);
    expect(canSubmitIdentityCorrection({ status: "PENDING" })).toBe(true);
    expect(canSubmitIdentityCorrection({ status: "SUBMITTED" })).toBe(false);
    expect(canSubmitIdentityCorrection({ status: "ACCEPTED_BY_QA" })).toBe(false);
  });

  it("closes every gate action once the job is past the bench", () => {
    for (const status of ["SUBMITTED", "ACCEPTED_BY_QA"]) {
      const job = { ...base, status, akdAklApprovalStatus: "PENDING_REVIEW" };
      expect(isIdentityGateLocked(job)).toBe(true);
      expect(canEscalateIdentity({ ...job, akdAklApprovalStatus: "REJECTED" })).toBe(false);
      expect(canDecideIdentity(job)).toBe(false);
      expect(canSubmitIdentityCorrection(job)).toBe(false);
    }
  });
});

describe("quality-review helpers", () => {
  const approved = { status: "APPROVED" };
  const rejected = { status: "REJECTED" };

  it("treats SUBMITTED without APPROVED as awaiting MT review", () => {
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [] })).toBe(true);
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
    expect(isQualityReviewApproved({ status: "SUBMITTED", reviews: [approved] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
    expect(canDecideQualityReview({ status: "IN_PROGRESS", reviews: [] })).toBe(false);
  });

  it("treats SUBMITTED + latest REJECTED as awaiting the current cycle, not active rejection", () => {
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [rejected] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [rejected] })).toBe(true);
    expect(shouldShowRejectionFeedback({ status: "SUBMITTED", reviews: [rejected] })).toBe(false);
  });

  it("shows rejection feedback on REWORK, not on SUBMITTED, and hides decide", () => {
    expect(shouldShowRejectionFeedback({ status: "REWORK", reviews: [rejected] })).toBe(true);
    expect(canDecideQualityReview({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(isAwaitingQualityReview({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(shouldShowRejectionFeedback({ status: "IN_PROGRESS", reviews: [rejected] })).toBe(true);
  });

  it("shows the rejected attempt while REWORK, then the current attempt after resume", () => {
    expect(qualityReviewDisplayAttempt({ status: "REWORK", currentAttempt: 2 })).toBe(1);
    expect(qualityReviewDisplayAttempt({ status: "IN_PROGRESS", currentAttempt: 2 })).toBe(2);
    expect(qualityReviewDisplayAttempt({ status: "SUBMITTED", currentAttempt: 1 })).toBe(1);
  });

  it("hides decide after REJECT until the job is SUBMITTED again", () => {
    expect(canDecideQualityReview({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(canDecideQualityReview({ status: "IN_PROGRESS", reviews: [rejected] })).toBe(false);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [rejected] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
  });

  it("rejects empty or whitespace-only notes and sends trimmed REJECT notes", () => {
    expect(toQualityReviewRejectInput("")).toBeNull();
    expect(toQualityReviewRejectInput("   ")).toBeNull();
    expect(toQualityReviewRejectInput("\n\t")).toBeNull();
    expect(toQualityReviewRejectInput("  NIBP diukur ulang  ")).toEqual({
      decision: "REJECT",
      notes: "NIBP diukur ulang",
    });
  });
});

describe("formatCalibrationJobApiError", () => {
  it("maps known backend codes to Indonesian copy", () => {
    const err = new ApiError(400, "raw", { code: "DEVICE_TYPE_MISMATCH" });
    expect(formatCalibrationJobApiError(err, "fallback")).toContain("Jenis alat");
  });

  it("maps the new identity-correction codes", () => {
    for (const code of [
      "IDENTITY_CORRECTION_NO_CHANGE",
      "IDENTITY_CORRECTION_ALREADY_PENDING",
      "IDENTITY_CORRECTION_ALREADY_DECIDED",
      "IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING",
    ]) {
      const msg = formatCalibrationJobApiError(new ApiError(400, "raw", { code }), "fb");
      expect(msg).not.toBe("fb");
      expect(msg.length).toBeGreaterThan(5);
    }
  });

  it("maps quality-review happy-path codes", () => {
    for (const code of [
      "CALIBRATION_JOB_ALREADY_SUBMITTED",
      "CALIBRATION_JOB_NOT_SUBMITTED",
      "QUALITY_REVIEW_ALREADY_APPROVED",
      "QUALITY_REVIEW_NOT_APPROVED",
      "QUALITY_REVIEW_NOTES_REQUIRED",
      "CALIBRATION_JOB_ALREADY_COMPLETED",
      "INVALID_QUALITY_REVIEW_DECISION",
      "CALIBRATION_JOB_NOT_IN_REWORK",
    ]) {
      const msg = formatCalibrationJobApiError(new ApiError(400, "raw", { code }), "fb");
      expect(msg).not.toBe("fb");
      expect(msg.length).toBeGreaterThan(5);
    }
  });

  it("falls back to the server message, then the provided fallback", () => {
    expect(
      formatCalibrationJobApiError(new ApiError(400, "srv", { message: "srv detail" }), "fb"),
    ).toBe("srv detail");
    expect(formatCalibrationJobApiError(new Error("x"), "fb")).toBe("fb");
  });
});

describe("summarizeCorrectionChanges", () => {
  const empty = {
    prevDevice: null,
    newDevice: null,
    newDeviceId: null,
    prevSerial: null,
    newSerial: null,
    prevAkdAkl: null,
    newAkdAkl: null,
  };

  it("returns only the attributes the BA actually changed", () => {
    expect(
      summarizeCorrectionChanges({
        ...empty,
        newDeviceId: "dev-2",
        prevDevice: { code: "DVC-000001" },
        newDevice: { code: "DVC-000002" },
      }),
    ).toEqual([{ attr: "Device", prev: "DVC-000001", next: "DVC-000002" }]);

    expect(
      summarizeCorrectionChanges({ ...empty, prevSerial: null, newSerial: "SN-9" }),
    ).toEqual([{ attr: "Serial", prev: "—", next: "SN-9" }]);

    expect(summarizeCorrectionChanges(empty)).toEqual([]);
  });
});

describe("correction photo helpers", () => {
  it("correctionMissingImage is true when a signer signed but the correction has no photo", () => {
    expect(
      correctionMissingImage({
        files: [],
        signatures: [{ status: "SIGNED" }, { status: "UNAVAILABLE" }],
      }),
    ).toBe(true);
  });

  it("correctionMissingImage is false once the correction has a photo", () => {
    expect(
      correctionMissingImage({
        files: [{ id: "f1" }],
        signatures: [{ status: "SIGNED" }, { status: "SIGNED" }],
      }),
    ).toBe(false);
  });

  it("correctionMissingImage is false when no signer actually signed", () => {
    expect(
      correctionMissingImage({
        files: [],
        signatures: [{ status: "UNAVAILABLE" }, { status: "REFUSED" }],
      }),
    ).toBe(false);
  });
});
