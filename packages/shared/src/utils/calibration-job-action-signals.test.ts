import { describe, expect, it } from "vitest";
import {
  actionBadgeLabel,
  countActiveActionSignals,
  EMPTY_CALIBRATION_JOB_ACTION_SIGNALS,
  jobNeedsAction,
} from "./calibration-job-action-signals";

describe("calibration job action signals", () => {
  it("counts active signals regardless of how many keys the map has", () => {
    expect(countActiveActionSignals(EMPTY_CALIBRATION_JOB_ACTION_SIGNALS)).toBe(0);
    expect(
      countActiveActionSignals({
        identityCorrectionPending: true,
        referenceEquipmentNeedsApproval: false,
      }),
    ).toBe(1);
    // A future 3rd/4th signal is just another key — the helper is not hardcoded to two.
    expect(
      countActiveActionSignals({
        identityCorrectionPending: true,
        referenceEquipmentNeedsApproval: true,
        measurementSubmissionPending: true,
        certificateReviewPending: false,
      }),
    ).toBe(3);
  });

  it("jobNeedsAction is true when any signal is set", () => {
    expect(jobNeedsAction(EMPTY_CALIBRATION_JOB_ACTION_SIGNALS)).toBe(false);
    expect(jobNeedsAction({ a: false, b: false })).toBe(false);
    expect(jobNeedsAction({ a: false, b: true })).toBe(true);
  });

  it("actionBadgeLabel returns a count label or null", () => {
    expect(actionBadgeLabel(0)).toBeNull();
    expect(actionBadgeLabel(1)).toBe("1 perlu tindakan");
    expect(actionBadgeLabel(4)).toBe("4 perlu tindakan");
  });
});
