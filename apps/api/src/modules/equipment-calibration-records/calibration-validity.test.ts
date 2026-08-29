import { describe, expect, it } from "vitest";
import {
  resolveCalibrationValidity,
  type CalibrationValidityRecord,
} from "./calibration-validity";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function rec(over: Partial<CalibrationValidityRecord> & { id: string }): CalibrationValidityRecord {
  return {
    status: "CONFIRMED",
    calibrationDate: d("2026-03-15"),
    validFrom: null,
    validUntil: d("2027-03-15"),
    ...over,
  };
}

describe("resolveCalibrationValidity", () => {
  it("returns NO_RECORD when there is no confirmed record", () => {
    expect(resolveCalibrationValidity([], d("2026-06-01")).status).toBe("NO_RECORD");
    // A DRAFT record does not establish validity.
    expect(
      resolveCalibrationValidity([rec({ id: "a", status: "DRAFT" })], d("2026-06-01")).status,
    ).toBe("NO_RECORD");
  });

  it("VALID when asOf is inside [calibrationDate, validUntil]", () => {
    const r = resolveCalibrationValidity([rec({ id: "a" })], d("2026-06-01"));
    expect(r.status).toBe("VALID");
    expect(r.recordId).toBe("a");
    expect(r.validUntil).toEqual(d("2027-03-15"));
  });

  it("VALID exactly on the calibrationDate boundary (inclusive start)", () => {
    expect(resolveCalibrationValidity([rec({ id: "a" })], d("2026-03-15")).status).toBe("VALID");
  });

  it("VALID exactly on the validUntil boundary (inclusive end)", () => {
    expect(resolveCalibrationValidity([rec({ id: "a" })], d("2027-03-15")).status).toBe("VALID");
  });

  it("uses validFrom as the interval start when set", () => {
    const r = rec({ id: "a", validFrom: d("2026-04-01"), calibrationDate: d("2026-03-15") });
    expect(resolveCalibrationValidity([r], d("2026-03-20")).status).toBe("NOT_YET_VALID");
    expect(resolveCalibrationValidity([r], d("2026-04-01")).status).toBe("VALID");
  });

  it("EXPIRED when asOf is after validUntil", () => {
    const r = resolveCalibrationValidity([rec({ id: "a" })], d("2027-04-01"));
    expect(r.status).toBe("EXPIRED");
    expect(r.recordId).toBe("a");
  });

  it("NOT_YET_VALID when asOf precedes the earliest calibration", () => {
    const r = resolveCalibrationValidity([rec({ id: "a" })], d("2026-01-01"));
    expect(r.status).toBe("NOT_YET_VALID");
  });

  it("picks the most recent covering record when periods overlap", () => {
    const older = rec({ id: "old", calibrationDate: d("2025-03-01"), validUntil: d("2026-06-01") });
    const newer = rec({ id: "new", calibrationDate: d("2026-03-01"), validUntil: d("2027-03-01") });
    const r = resolveCalibrationValidity([older, newer], d("2026-04-01"));
    expect(r.status).toBe("VALID");
    expect(r.recordId).toBe("new");
  });

  it("resolves against the last applicable record when the latest one has lapsed", () => {
    const a = rec({ id: "a", calibrationDate: d("2025-01-01"), validUntil: d("2026-01-01") });
    const b = rec({ id: "b", calibrationDate: d("2026-01-15"), validUntil: d("2026-02-01") });
    const r = resolveCalibrationValidity([a, b], d("2026-03-01"));
    expect(r.status).toBe("EXPIRED");
    expect(r.recordId).toBe("b");
  });
});
