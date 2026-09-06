import { describe, expect, it } from "vitest";
import {
  fmtDateOnly,
  fmtTimestampDay,
  isCalibrationValidityWindowOk,
  parseDateOnly,
  toDateInputValue,
  toDateOnlyString,
} from "./equipment-calibration-record-date-utils";

describe("parseDateOnly / fmtDateOnly / toDateOnlyString", () => {
  it('displays "2024-03-01" as "01/03/2024" (1 March, not 3 January)', () => {
    expect(fmtDateOnly("2024-03-01")).toBe("01/03/2024");
    expect(fmtDateOnly("2024-03-01T00:00:00.000Z")).toBe("01/03/2024");
  });

  it("selecting 1 March 2024 produces form state YYYY-MM-DD", () => {
    const selected = new Date(2024, 2, 1); // local calendar: 1 March 2024
    expect(toDateOnlyString(selected)).toBe("2024-03-01");
  });

  it("round-trips display → form state → display without day/month inversion", () => {
    const wire = "2024-03-01";
    expect(fmtDateOnly(wire)).toBe("01/03/2024");

    const selected = parseDateOnly(wire);
    expect(selected).toBeDefined();
    expect(selected!.getFullYear()).toBe(2024);
    expect(selected!.getMonth()).toBe(2); // March
    expect(selected!.getDate()).toBe(1);

    const back = toDateOnlyString(selected);
    expect(back).toBe("2024-03-01");
    expect(fmtDateOnly(back)).toBe("01/03/2024");
  });

  it("does not invert ambiguous day/month pairs", () => {
    // 11 March must never become 3 November
    expect(fmtDateOnly("2024-03-11")).toBe("11/03/2024");
    expect(toDateOnlyString(parseDateOnly("2024-03-11"))).toBe("2024-03-11");

    // 31 August — only valid as day 31 / month 08
    expect(fmtDateOnly("2026-08-31")).toBe("31/08/2026");
    expect(toDateOnlyString(parseDateOnly("2026-08-31"))).toBe("2026-08-31");
  });

  it("avoids UTC midnight shift when formatting date-only values", () => {
    // new Date("YYYY-MM-DD") is UTC midnight; parseDateOnly is local midnight.
    const local = parseDateOnly("2024-03-01")!;
    expect(local.getHours()).toBe(0);
    expect(local.getDate()).toBe(1);
    expect(local.getMonth()).toBe(2);
    expect(fmtDateOnly("2024-03-01")).toBe("01/03/2024");
  });

  it("returns em dash for empty values", () => {
    expect(fmtDateOnly(null)).toBe("—");
    expect(fmtDateOnly("")).toBe("—");
    expect(toDateOnlyString(undefined)).toBe("");
  });
});

describe("toDateInputValue (API reload → form state)", () => {
  it("keeps save/reload canonical YYYY-MM-DD", () => {
    expect(toDateInputValue("2024-03-01T00:00:00.000Z")).toBe("2024-03-01");
    expect(toDateInputValue("2024-03-01")).toBe("2024-03-01");
    expect(toDateInputValue(null)).toBe("");
  });
});

describe("isCalibrationValidityWindowOk", () => {
  it("allows validFrom/calibrationDate on or before validUntil", () => {
    expect(isCalibrationValidityWindowOk("2024-03-01", "", "2025-03-01")).toBe(true);
    expect(isCalibrationValidityWindowOk("2024-03-01", "2024-03-01", "2024-03-01")).toBe(true);
    expect(isCalibrationValidityWindowOk("2024-03-01", "2024-04-01", "2025-01-01")).toBe(true);
  });

  it("rejects when start is after validUntil", () => {
    expect(isCalibrationValidityWindowOk("2025-06-01", "", "2025-03-01")).toBe(false);
    expect(isCalibrationValidityWindowOk("2024-03-01", "2025-06-01", "2025-03-01")).toBe(false);
  });

  it("rejects missing required dates", () => {
    expect(isCalibrationValidityWindowOk("", "", "2025-03-01")).toBe(false);
    expect(isCalibrationValidityWindowOk("2024-03-01", "", "")).toBe(false);
  });
});

describe("fmtTimestampDay", () => {
  it("formats instants as local dd/MM/yyyy", () => {
    // Fixed local construction avoids depending on host TZ for the assertion shape.
    const localIso = new Date(2024, 2, 1, 15, 30, 0).toISOString();
    expect(fmtTimestampDay(localIso)).toBe("01/03/2024");
  });
});
