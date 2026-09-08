import { describe, expect, it } from "vitest";
import {
  canRecordMeasurement,
  formatMeasuredValue,
  isMeasurementLocked,
  isValidMeasuredValue,
  measuredValueInputStep,
  measurementLockedReason,
  parameterEntryStatus,
  passFailChip,
  toleranceText,
} from "./measurement";

describe("formatMeasuredValue", () => {
  it("formats to the parameter's decimalPlaces", () => {
    expect(formatMeasuredValue("120.4", 0)).toBe("120");
    expect(formatMeasuredValue("36.58", 1)).toBe("36.6");
    expect(formatMeasuredValue(0.5, 2)).toBe("0.50");
  });
  it("treats null/blank decimalPlaces as 0 (never hardcoded elsewhere)", () => {
    expect(formatMeasuredValue("78.9", null)).toBe("79");
    expect(formatMeasuredValue("78.9", undefined)).toBe("79");
  });
  it("returns an em dash for missing values", () => {
    expect(formatMeasuredValue(null, 1)).toBe("—");
    expect(formatMeasuredValue("", 1)).toBe("—");
  });
});

describe("measuredValueInputStep", () => {
  it("derives the numeric step from the precision", () => {
    expect(measuredValueInputStep(0)).toBe("1");
    expect(measuredValueInputStep(1)).toBe("0.1");
    expect(measuredValueInputStep(3)).toBe("0.001");
  });
});

describe("isValidMeasuredValue", () => {
  it("accepts plain decimals and integers, rejects junk", () => {
    expect(isValidMeasuredValue("120")).toBe(true);
    expect(isValidMeasuredValue("-3.25")).toBe(true);
    expect(isValidMeasuredValue(" 12.0 ")).toBe(true);
    expect(isValidMeasuredValue("12,0")).toBe(false);
    expect(isValidMeasuredValue("abc")).toBe(false);
    expect(isValidMeasuredValue("")).toBe(false);
  });
});

describe("toleranceText", () => {
  const uom = { symbol: "lux" };
  it("prefers the verbatim LK note", () => {
    expect(
      toleranceText({
        toleranceMin: "15000",
        toleranceMax: null,
        toleranceNote: ">15.000 lux",
        uom,
      }),
    ).toBe(">15.000 lux");
  });
  it("falls back to resolved bounds", () => {
    expect(
      toleranceText({ toleranceMin: "15000", toleranceMax: null, toleranceNote: null, uom }),
    ).toBe("≥ 15000 lux");
    expect(
      toleranceText({ toleranceMin: null, toleranceMax: "40", toleranceNote: null, uom: { symbol: "°C" } }),
    ).toBe("≤ 40 °C");
    expect(
      toleranceText({ toleranceMin: "2", toleranceMax: "8", toleranceNote: null, uom: { symbol: "°C" } }),
    ).toBe("2 °C – 8 °C");
  });
  it("handles the no-tolerance case", () => {
    expect(
      toleranceText({ toleranceMin: null, toleranceMax: null, toleranceNote: null, uom: null }),
    ).toBe("Tanpa toleransi terukur");
  });
});

describe("passFailChip", () => {
  it("maps the verdict straight from the write response", () => {
    expect(passFailChip(true).tone).toBe("pass");
    expect(passFailChip(false).tone).toBe("fail");
    expect(passFailChip(null).tone).toBe("unknown");
    expect(passFailChip(null).label).toBe("Perlu telaah");
  });
});

describe("lock helpers", () => {
  it("isMeasurementLocked follows MEASUREMENT_LOCKED_JOB_STATUSES", () => {
    expect(isMeasurementLocked({ status: "SUBMITTED" })).toBe(true);
    expect(isMeasurementLocked({ status: "ACCEPTED_BY_QA" })).toBe(true);
    expect(isMeasurementLocked({ status: "IN_PROGRESS" })).toBe(false);
  });
  it("canRecordMeasurement requires a started, IN_PROGRESS job", () => {
    expect(canRecordMeasurement({ status: "IN_PROGRESS", startedAt: "2026-09-08T00:00:00Z" })).toBe(true);
    expect(canRecordMeasurement({ status: "IN_PROGRESS", startedAt: null })).toBe(false);
    expect(canRecordMeasurement({ status: "PENDING", startedAt: null })).toBe(false);
    expect(canRecordMeasurement({ status: "SUBMITTED", startedAt: "2026-09-08T00:00:00Z" })).toBe(false);
  });
  it("measurementLockedReason explains each blocked state", () => {
    expect(measurementLockedReason({ status: "PENDING", startedAt: null })).toMatch(/belum dimulai/);
    expect(measurementLockedReason({ status: "SUBMITTED", startedAt: "x" })).toMatch(/terkunci/);
    expect(measurementLockedReason({ status: "REWORK", startedAt: "x" })).toMatch(/perbaikan/);
    expect(measurementLockedReason({ status: "IN_PROGRESS", startedAt: "x" })).toBeNull();
  });
});

describe("parameterEntryStatus", () => {
  const row = (replicateIndex: number, measuredValue: string | null, isWithinTolerance: boolean | null) => ({
    replicateIndex,
    measuredValue,
    isWithinTolerance,
  });

  it("counts filled replicates against the seeded default of 5", () => {
    const s = parameterEntryStatus([row(1, "10", true), row(2, "11", true), row(3, null, null)]);
    expect(s).toMatchObject({ filled: 2, total: 5, complete: false, anyFail: false });
  });
  it("is complete once every seeded row has a value", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row(i, String(i), true));
    expect(parameterEntryStatus(rows)).toMatchObject({ filled: 5, total: 5, complete: true });
  });
  it("grows total when more replicates exist than the default", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => row(i, String(i), i === 7 ? false : true));
    expect(parameterEntryStatus(rows)).toMatchObject({ filled: 7, total: 7, complete: true, anyFail: true });
  });
  it("is not complete with zero readings", () => {
    expect(parameterEntryStatus([])).toMatchObject({ filled: 0, complete: false });
  });
});
