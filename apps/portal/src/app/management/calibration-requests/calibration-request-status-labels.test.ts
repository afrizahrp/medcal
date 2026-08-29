import { describe, expect, it } from "vitest";
import { STATUS_LABELS, STATUS_OPTIONS } from "./calibration-request-status";

describe("CalibrationRequest Portal status display", () => {
  it("renders IN_QUOTATION as IN PROGRESS without changing the enum value", () => {
    expect(STATUS_OPTIONS).toContain("IN_QUOTATION");
    expect(STATUS_LABELS.IN_QUOTATION).toBe("In Progress");
    expect(STATUS_LABELS.IN_QUOTATION.toUpperCase()).toBe("IN PROGRESS");
  });

  it("keeps other status display labels aligned to the existing enum", () => {
    expect(STATUS_LABELS.DRAFT).toBe("Draft");
    expect(STATUS_LABELS.SUBMITTED).toBe("Submitted");
    expect(STATUS_LABELS.CANCELLED).toBe("Cancelled");
    expect(STATUS_LABELS.FULFILLED).toBe("Fulfilled");
  });
});
