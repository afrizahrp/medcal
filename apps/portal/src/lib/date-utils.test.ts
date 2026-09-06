import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  displayToIso,
  fmtDateOnly,
  fmtTimestampDay,
  isCalibrationValidityWindowOk,
  isLeapYear,
  isRealCalendarDate,
  isoToDisplay,
  maskDateInput,
  parseDateOnly,
  toDateInputValue,
  toDateOnlyString,
  validateDisplayDate,
} from "./date-utils";

describe("isLeapYear / daysInMonth", () => {
  it("applies the Gregorian rule", () => {
    expect(isLeapYear(2024)).toBe(true); // divisible by 4
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // divisible by 100, not 400
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
  });

  it("returns real month lengths", () => {
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(daysInMonth(2026, 13)).toBe(0);
  });
});

describe("isRealCalendarDate", () => {
  it("rejects impossible day/month combinations", () => {
    expect(isRealCalendarDate(2026, 2, 31)).toBe(false); // February
    expect(isRealCalendarDate(2026, 4, 31)).toBe(false); // 30-day months
    expect(isRealCalendarDate(2026, 6, 31)).toBe(false);
    expect(isRealCalendarDate(2026, 9, 31)).toBe(false);
    expect(isRealCalendarDate(2026, 11, 31)).toBe(false);
    expect(isRealCalendarDate(2025, 2, 29)).toBe(false); // non-leap
  });

  it("accepts valid dates including leap day", () => {
    expect(isRealCalendarDate(2024, 2, 29)).toBe(true);
    expect(isRealCalendarDate(2026, 1, 31)).toBe(true);
    expect(isRealCalendarDate(2026, 4, 30)).toBe(true);
  });
});

describe("parseDateOnly / fmtDateOnly / toDateOnlyString", () => {
  it('displays "2024-03-01" as "01/03/2024" (1 March, not 3 January)', () => {
    expect(fmtDateOnly("2024-03-01")).toBe("01/03/2024");
    expect(fmtDateOnly("2024-03-01T00:00:00.000Z")).toBe("01/03/2024");
  });

  it("selecting 1 March 2024 produces form state YYYY-MM-DD", () => {
    expect(toDateOnlyString(new Date(2024, 2, 1))).toBe("2024-03-01");
  });

  it("round-trips display → form state → display without day/month inversion", () => {
    const wire = "2024-03-11"; // 11 March must never become 3 November
    expect(fmtDateOnly(wire)).toBe("11/03/2024");
    const selected = parseDateOnly(wire)!;
    expect(selected.getFullYear()).toBe(2024);
    expect(selected.getMonth()).toBe(2);
    expect(selected.getDate()).toBe(11);
    expect(toDateOnlyString(selected)).toBe("2024-03-11");
  });

  it("avoids UTC midnight shift for date-only values", () => {
    const local = parseDateOnly("2024-03-01")!;
    expect(local.getHours()).toBe(0);
    expect(local.getDate()).toBe(1);
    expect(local.getMonth()).toBe(2);
  });

  it("rejects malformed or calendar-invalid input", () => {
    expect(parseDateOnly("2026-02-31")).toBeUndefined();
    expect(parseDateOnly("2026-13-01")).toBeUndefined();
    expect(parseDateOnly("not-a-date")).toBeUndefined();
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

describe("fmtTimestampDay", () => {
  it("formats instants as local dd/MM/yyyy", () => {
    const localIso = new Date(2024, 2, 1, 15, 30, 0).toISOString();
    expect(fmtTimestampDay(localIso)).toBe("01/03/2024");
    expect(fmtTimestampDay(null)).toBe("—");
  });
});

describe("maskDateInput", () => {
  it("auto-formats free-typed digits to dd/mm/yyyy", () => {
    expect(maskDateInput("31022026")).toBe("31/02/2026");
    expect(maskDateInput("29022024")).toBe("29/02/2024");
  });

  it("inserts a trailing slash after a 2-digit day and month while typing", () => {
    expect(maskDateInput("3")).toBe("3");
    expect(maskDateInput("31")).toBe("31/");
    expect(maskDateInput("3103")).toBe("31/03/");
    expect(maskDateInput("31032")).toBe("31/03/2");
  });

  it("omits the trailing slash while deleting so backspace is not trapped", () => {
    expect(maskDateInput("31", { trailingSlash: false })).toBe("31");
    expect(maskDateInput("31/03", { trailingSlash: false })).toBe("31/03");
  });

  it("ignores non-digits and caps at 8 digits", () => {
    expect(maskDateInput("31/02/2026extra")).toBe("31/02/2026");
    expect(maskDateInput("aa11bb22cc3333")).toBe("11/22/3333");
  });
});

describe("displayToIso / isoToDisplay", () => {
  it("converts a complete valid display value to wire form", () => {
    expect(displayToIso("15/03/2026")).toBe("2026-03-15");
    expect(displayToIso("29/02/2024")).toBe("2024-02-29");
  });

  it("returns null for incomplete or calendar-invalid values", () => {
    expect(displayToIso("15/03")).toBeNull();
    expect(displayToIso("31/02/2026")).toBeNull();
    expect(displayToIso("29/02/2025")).toBeNull();
    expect(displayToIso("31/04/2026")).toBeNull();
  });

  it("round-trips wire → display → wire", () => {
    expect(isoToDisplay("2026-03-01")).toBe("01/03/2026");
    expect(displayToIso(isoToDisplay("2026-03-01"))).toBe("2026-03-01");
    expect(isoToDisplay("")).toBe("");
  });
});

describe("validateDisplayDate", () => {
  it("passes an empty value unless required", () => {
    expect(validateDisplayDate("")).toBeNull();
    expect(validateDisplayDate("  ", { required: true })).toBe("Tanggal wajib diisi");
  });

  it("rejects an incomplete or wrongly-shaped value", () => {
    expect(validateDisplayDate("15/03")).toBe("Format tanggal harus dd/mm/yyyy");
    expect(validateDisplayDate("2026-03-01")).toBe("Format tanggal harus dd/mm/yyyy");
  });

  it("rejects a well-shaped but impossible date", () => {
    expect(validateDisplayDate("31/02/2026")).toBe("Tanggal tidak valid");
    expect(validateDisplayDate("29/02/2025")).toBe("Tanggal tidak valid");
  });

  it("accepts a real date (including a leap day)", () => {
    expect(validateDisplayDate("29/02/2024")).toBeNull();
    expect(validateDisplayDate("15/03/2026", { required: true })).toBeNull();
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
