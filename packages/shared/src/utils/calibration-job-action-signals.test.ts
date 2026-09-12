import { describe, expect, it } from "vitest";
import {
  actionBadgeLabel,
  countActiveActionSignals,
  EMPTY_CALIBRATION_JOB_ACTION_SIGNALS,
  isIdentityIncomplete,
  jobNeedsAction,
} from "./calibration-job-action-signals";

describe("calibration job action signals", () => {
  it("counts active signals regardless of how many keys the map has", () => {
    expect(countActiveActionSignals(EMPTY_CALIBRATION_JOB_ACTION_SIGNALS)).toBe(0);
    expect(
      countActiveActionSignals({
        identityCorrectionPending: true,
        referenceEquipmentNeedsApproval: false,
        identityIncomplete: false,
      }),
    ).toBe(1);
    // A future 3rd/4th signal is just another key — the helper is not hardcoded to two.
    expect(
      countActiveActionSignals({
        identityCorrectionPending: true,
        referenceEquipmentNeedsApproval: true,
        identityIncomplete: true,
        measurementSubmissionPending: true,
        certificateReviewPending: false,
      }),
    ).toBe(4);
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

describe("isIdentityIncomplete", () => {
  const started = "2026-09-12T00:00:00.000Z";

  it("is false when Device ID and Serial are both present", () => {
    expect(
      isIdentityIncomplete({
        startedAt: started,
        deviceId: "dev-1",
        technicianObservedSerial: "SN-001",
      }),
    ).toBe(false);
  });

  it("is false when Device ID equals Serial (allowed)", () => {
    expect(
      isIdentityIncomplete({
        startedAt: started,
        deviceId: "DVC-001",
        technicianObservedSerial: "DVC-001",
      }),
    ).toBe(false);
  });

  it("is true when Device ID is missing after start", () => {
    expect(
      isIdentityIncomplete({
        startedAt: started,
        deviceId: null,
        technicianObservedSerial: "SN-001",
      }),
    ).toBe(true);
  });

  it("is true when Serial is missing after start", () => {
    expect(
      isIdentityIncomplete({
        startedAt: started,
        deviceId: "dev-1",
        technicianObservedSerial: null,
      }),
    ).toBe(true);
  });

  it("is true when Serial is blank whitespace after start", () => {
    expect(
      isIdentityIncomplete({
        startedAt: started,
        deviceId: "dev-1",
        technicianObservedSerial: "   ",
      }),
    ).toBe(true);
  });

  it("is true when both Device ID and Serial are missing after start", () => {
    expect(
      isIdentityIncomplete({
        startedAt: started,
        deviceId: null,
        technicianObservedSerial: null,
      }),
    ).toBe(true);
  });

  it("is false before technician work starts even when identity is null", () => {
    expect(
      isIdentityIncomplete({
        startedAt: null,
        deviceId: null,
        technicianObservedSerial: null,
      }),
    ).toBe(false);
  });
});
