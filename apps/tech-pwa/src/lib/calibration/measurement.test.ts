import { describe, expect, it } from "vitest";
import {
  canRecordMeasurement,
  capabilityGroupSections,
  expectedReplicateCount,
  formatMeasuredValue,
  gridEntryStatus,
  hasCapabilityGroups,
  isMeasurementLocked,
  isValidMeasuredValue,
  measuredValueInputStep,
  measurementLockedReason,
  parameterEntryStatus,
  passFailChip,
  toleranceText,
  usesDirection,
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

describe("expectedReplicateCount / usesDirection", () => {
  it("uses 3 columns for Ventilator and Audiometer prefixes, otherwise 5", () => {
    expect(expectedReplicateCount("VENT_PEEP")).toBe(3);
    expect(expectedReplicateCount("VENT_TIDAL_VOLUME")).toBe(3);
    expect(expectedReplicateCount("AUD_PURE_TONE_LINEARITY_KANAN")).toBe(3);
    expect(expectedReplicateCount("BSM_HEART_RATE")).toBe(5);
    expect(expectedReplicateCount("SPHYG_PRESSURE_ACC")).toBe(5);
  });
  it("flags only SPHYG_PRESSURE_ACC as a naik/turun parameter", () => {
    expect(usesDirection("SPHYG_PRESSURE_ACC")).toBe(true);
    expect(usesDirection("BSM_HEART_RATE")).toBe(false);
    expect(usesDirection("SUCT_VACUUM_GAUGE")).toBe(false);
  });
});

describe("gridEntryStatus", () => {
  const cell = (replicateIndex: number, measuredValue: string | null, isWithinTolerance: boolean | null) => ({
    replicateIndex,
    measuredValue,
    isWithinTolerance,
  });

  it("counts filled cells against points × expected replicates", () => {
    const s = gridEntryStatus([cell(1, "30", true), cell(2, "31", true)], 4, 5, 1);
    expect(s).toMatchObject({ filled: 2, total: 20, complete: false, anyFail: false });
  });
  it("is complete once every cell has a value", () => {
    const rows = [1, 2, 3, 4, 5].flatMap((i) => [
      cell(i, "30", true),
      cell(i, "60", true),
      cell(i, "120", true),
      cell(i, "180", true),
    ]);
    expect(gridEntryStatus(rows, 4, 5, 1)).toMatchObject({ filled: 20, total: 20, complete: true });
  });
  it("marks anyFail when a saved cell is out of tolerance", () => {
    const rows = [cell(1, "30", true), cell(1, "62", false)];
    expect(gridEntryStatus(rows, 4, 5, 1).anyFail).toBe(true);
  });
  it("uses 1 row × 3 replicates for a single-point parameter like VENT_PEEP", () => {
    const s = gridEntryStatus([cell(1, "20", true), cell(2, "20.1", true)], 1, 3, 1);
    expect(s).toMatchObject({ filled: 2, total: 3, complete: false });
    expect(gridEntryStatus([cell(1, "20", true), cell(2, "20", true), cell(3, "20", true)], 1, 3, 1)).toMatchObject({
      filled: 3,
      total: 3,
      complete: true,
    });
  });
  it("doubles total when directionCount is 2 (Sphyg naik/turun)", () => {
    expect(gridEntryStatus([], 6, 5, 2)).toMatchObject({ filled: 0, total: 60, complete: false });
  });
  it("grows total when more replicates exist than the expected count", () => {
    const rows = [1, 2, 3, 4].map((i) => cell(i, String(i), true));
    expect(gridEntryStatus(rows, 1, 3, 1)).toMatchObject({ filled: 4, total: 4, complete: true });
  });
});

describe("capabilityGroupSections / hasCapabilityGroups", () => {
  const param = (
    id: string,
    name: string,
    kind: "DIRECT" | "GRID",
    testPoints: { id: string; sequence: number; settingLabel: string }[] = [],
  ) => ({
    id,
    code: id,
    name,
    decimalPlaces: 0,
    uom: null,
    toleranceMin: null,
    toleranceMax: null,
    toleranceNote: null,
    capabilityName: "unused",
    capabilityItemName: "unused",
    kind,
    testPoints: testPoints.map((tp) => ({
      ...tp,
      settingValue: null,
      toleranceMin: null,
      toleranceMax: null,
      toleranceNote: null,
    })),
  });

  it("is true for an array (including empty) and false when the field is missing", () => {
    expect(hasCapabilityGroups([])).toBe(true);
    expect(hasCapabilityGroups(undefined)).toBe(false);
    expect(hasCapabilityGroups(null)).toBe(false);
  });

  it("preserves API capability and parameter order, including mixed DIRECT/GRID", () => {
    const groups = [
      {
        capability: { id: "cap-z", code: "Z", name: "Z Environment" },
        sortOrder: 10,
        parameters: [
          param("grid-1", "Zebra Sweep", "GRID", [
            { id: "tp-2", sequence: 2, settingLabel: "60" },
            { id: "tp-1", sequence: 1, settingLabel: "30" },
          ]),
          param("direct-1", "Alpha Suhu", "DIRECT"),
        ],
      },
      {
        capability: { id: "cap-a", code: "A", name: "A Safety" },
        sortOrder: 20,
        parameters: [param("direct-2", "Isolasi", "DIRECT")],
      },
    ];
    const sections = capabilityGroupSections(groups);
    expect(sections.map((s) => s.id)).toEqual(["cap-z", "cap-a"]);
    expect(sections.map((s) => s.name)).toEqual(["Z Environment", "A Safety"]);
    expect(
      sections[0]?.parameters.map((p) => ({
        id: p.parameter.id,
        kind: p.parameter.kind,
        pointCount: p.pointCount,
      })),
    ).toEqual([
      { id: "grid-1", kind: "GRID", pointCount: 2 },
      { id: "direct-1", kind: "DIRECT", pointCount: undefined },
    ]);
    expect(sections[1]?.parameters.map((p) => p.parameter.id)).toEqual(["direct-2"]);
  });

  it("does not alphabetically sort capabilities or parameters", () => {
    const groups = [
      {
        capability: { id: "2", code: "B", name: "Beta" },
        sortOrder: 10,
        parameters: [
          param("z", "Zulu", "DIRECT"),
          param("a", "Alpha", "GRID", [{ id: "t", sequence: 1, settingLabel: "1" }]),
        ],
      },
      {
        capability: { id: "1", code: "A", name: "Alpha" },
        sortOrder: 20,
        parameters: [param("m", "Mike", "DIRECT")],
      },
    ];
    const sections = capabilityGroupSections(groups);
    expect(sections.map((s) => s.name)).toEqual(["Beta", "Alpha"]);
    expect(sections[0]?.parameters.map((p) => p.parameter.name)).toEqual(["Zulu", "Alpha"]);
  });
});
