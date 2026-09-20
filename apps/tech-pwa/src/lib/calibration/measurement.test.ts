import { describe, expect, it } from "vitest";
import {
  canAddReplicateSlot,
  canRecordMeasurement,
  capabilityGroupSections,
  formatMeasuredValue,
  formatReadingDisplay,
  gridEntryStatus,
  hasCapabilityGroups,
  isMeasurementLocked,
  isReadingFilled,
  isValidMeasuredValue,
  measuredReadingPayload,
  measuredValueInputStep,
  measurementLockedReason,
  namedLabelForResult,
  namedPointGroupView,
  parameterEntryStatus,
  patternASlotLabels,
  patternBEntryPresentation,
  readingDisplayValue,
  replicateLabel,
  resolveMeasurementEntryTarget,
  shouldShowMeasurementSection,
  sortNamedMeasurementPoints,
  passFailChip,
  toleranceText,
  usesDirection,
  validateMeasuredDraft,
  validateMeasuredValue,
  visibleReplicateCount,
  type TechMeasurementParameter,
  type TechMeasurementParametersResponse,
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
  it("uses any when decimalPlaces is null (no restriction)", () => {
    expect(measuredValueInputStep(null)).toBe("any");
    expect(measuredValueInputStep(undefined)).toBe("any");
  });
});

describe("isValidMeasuredValue / validateMeasuredValue", () => {
  it("accepts plain decimals and integers, rejects junk", () => {
    expect(isValidMeasuredValue("120")).toBe(true);
    expect(isValidMeasuredValue("-3.25")).toBe(true);
    expect(isValidMeasuredValue(" 12.0 ")).toBe(true);
    expect(isValidMeasuredValue("12,0")).toBe(false);
    expect(isValidMeasuredValue("abc")).toBe(false);
    expect(isValidMeasuredValue("")).toBe(false);
  });

  it("enforces decimalPlaces = 0 as a maximum", () => {
    expect(isValidMeasuredValue("23", 0)).toBe(true);
    expect(isValidMeasuredValue("23.0", 0)).toBe(false);
    expect(isValidMeasuredValue("23.2", 0)).toBe(false);
  });

  it("enforces decimalPlaces = 1 as a maximum", () => {
    expect(isValidMeasuredValue("23", 1)).toBe(true);
    expect(isValidMeasuredValue("23.0", 1)).toBe(true);
    expect(isValidMeasuredValue("23.2", 1)).toBe(true);
    expect(isValidMeasuredValue("23.23", 1)).toBe(false);
  });

  it("enforces decimalPlaces = 2 as a maximum", () => {
    expect(isValidMeasuredValue("23", 2)).toBe(true);
    expect(isValidMeasuredValue("23.2", 2)).toBe(true);
    expect(isValidMeasuredValue("23.23", 2)).toBe(true);
    expect(isValidMeasuredValue("23.234", 2)).toBe(false);
  });

  it("does not restrict fractional digits when decimalPlaces is null", () => {
    expect(isValidMeasuredValue("23.234567", null)).toBe(true);
    expect(isValidMeasuredValue("23.234567")).toBe(true);
  });

  it("distinguishes invalid format from excess decimals", () => {
    expect(validateMeasuredValue("12,0", 1)).toEqual({ ok: false, reason: "invalid_format" });
    expect(validateMeasuredValue("23.23", 1)).toEqual({
      ok: false,
      reason: "decimal_places_exceeded",
      decimalPlaces: 1,
    });
    expect(validateMeasuredValue("23.2", 1)).toEqual({ ok: true });
  });
});

describe("validateMeasuredDraft / measuredReadingPayload", () => {
  it("routes numeric drafts to measuredValue and clears measuredText", () => {
    expect(validateMeasuredDraft("120.5", 1)).toEqual({
      ok: true,
      kind: "numeric",
      payload: { measuredValue: "120.5", measuredText: null },
    });
    expect(measuredReadingPayload(validateMeasuredDraft("120.5", 1))).toEqual({
      measuredValue: "120.5",
      measuredText: null,
    });
  });

  it("routes non-numeric drafts to measuredText and clears measuredValue", () => {
    expect(validateMeasuredDraft("OL", 1)).toEqual({
      ok: true,
      kind: "symbol",
      payload: { measuredValue: null, measuredText: "OL" },
    });
    expect(validateMeasuredDraft("√", null)).toEqual({
      ok: true,
      kind: "symbol",
      payload: { measuredValue: null, measuredText: "√" },
    });
    expect(measuredReadingPayload(validateMeasuredDraft("—", 0))).toEqual({
      measuredValue: null,
      measuredText: "—",
    });
  });

  it("still rejects numeric shape that exceeds decimalPlaces", () => {
    expect(validateMeasuredDraft("23.23", 1)).toEqual({
      ok: false,
      reason: "decimal_places_exceeded",
      decimalPlaces: 1,
    });
    expect(measuredReadingPayload(validateMeasuredDraft("23.23", 1))).toBeNull();
  });

  it("treats blank as empty (nothing to save)", () => {
    expect(validateMeasuredDraft("   ", 1)).toEqual({ ok: true, kind: "empty" });
    expect(measuredReadingPayload(validateMeasuredDraft("", 1))).toBeNull();
  });
});

describe("readingDisplayValue / isReadingFilled / formatReadingDisplay", () => {
  it("hydrates numeric first, then symbol, then empty", () => {
    expect(readingDisplayValue({ measuredValue: "12.0", measuredText: null })).toBe("12.0");
    expect(readingDisplayValue({ measuredValue: null, measuredText: "OL" })).toBe("OL");
    expect(readingDisplayValue({ measuredValue: "", measuredText: "√" })).toBe("√");
    expect(readingDisplayValue({ measuredValue: null, measuredText: null })).toBe("");
    expect(readingDisplayValue(undefined)).toBe("");
  });

  it("counts either numeric or symbol as filled", () => {
    expect(isReadingFilled({ measuredValue: "10", measuredText: null })).toBe(true);
    expect(isReadingFilled({ measuredValue: null, measuredText: "OL" })).toBe(true);
    expect(isReadingFilled({ measuredValue: null, measuredText: "  " })).toBe(false);
    expect(isReadingFilled({ measuredValue: null, measuredText: null })).toBe(false);
  });

  it("formats numeric with precision and shows symbol text as-is", () => {
    expect(formatReadingDisplay({ measuredValue: "36.58", measuredText: null }, 1)).toBe("36.6");
    expect(formatReadingDisplay({ measuredValue: null, measuredText: "OL" }, 1)).toBe("OL");
    expect(formatReadingDisplay(null, 1)).toBe("—");
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
    expect(canRecordMeasurement({ status: "REWORK", startedAt: "2026-09-08T00:00:00Z" })).toBe(false);
  });

  it("keeps Hasil Pengukuran visible on REWORK even with zero current-attempt rows, but locked", () => {
    expect(shouldShowMeasurementSection({ status: "REWORK" }, true, false)).toBe(true);
    expect(shouldShowMeasurementSection({ status: "REWORK" }, false, false)).toBe(false);
    expect(shouldShowMeasurementSection({ status: "PENDING" }, true, false)).toBe(false);
    expect(shouldShowMeasurementSection({ status: "IN_PROGRESS" }, true, false)).toBe(true);
    expect(shouldShowMeasurementSection({ status: "SUBMITTED" }, true, true)).toBe(true);
    expect(shouldShowMeasurementSection({ status: "SUBMITTED" }, true, false)).toBe(false);
    expect(canRecordMeasurement({ status: "REWORK", startedAt: "2026-09-08T00:00:00Z" })).toBe(false);
    expect(measurementLockedReason({ status: "REWORK", startedAt: "x" })).toBe(
      "Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat hasil.",
    );
  });
  it("measurementLockedReason explains each blocked state", () => {
    expect(measurementLockedReason({ status: "PENDING", startedAt: null })).toMatch(/belum dimulai/);
    expect(measurementLockedReason({ status: "SUBMITTED", startedAt: "x" })).toMatch(/terkunci/);
    expect(measurementLockedReason({ status: "REWORK", startedAt: "x" })).toMatch(/perbaikan/);
    expect(measurementLockedReason({ status: "IN_PROGRESS", startedAt: "x" })).toBeNull();
  });
});

describe("parameterEntryStatus", () => {
  const row = (
    replicateIndex: number,
    measuredValue: string | null,
    isWithinTolerance: boolean | null,
    measuredText: string | null = null,
  ) => ({
    replicateIndex,
    measuredValue,
    measuredText,
    isWithinTolerance,
  });

  it("is incomplete with zero readings and does not assume five slots", () => {
    expect(parameterEntryStatus([])).toMatchObject({ filled: 0, total: 1, complete: false });
  });
  it("is complete once any reading exists — extra empty rows are not required", () => {
    const s = parameterEntryStatus([row(1, "10", true), row(2, "11", true), row(3, null, null)]);
    expect(s).toMatchObject({ filled: 2, total: 2, complete: true, anyFail: false });
  });
  it("counts symbol-only rows as filled", () => {
    const s = parameterEntryStatus([
      row(1, null, null, "OL"),
      row(2, "11", true),
      row(3, null, null, null),
    ]);
    expect(s).toMatchObject({ filled: 2, total: 2, complete: true });
  });
  it("stays complete with more than five replicates", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => row(i, String(i), true));
    expect(parameterEntryStatus(rows)).toMatchObject({ filled: 10, total: 10, complete: true });
  });
  it("marks anyFail when a saved reading is out of tolerance", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => row(i, String(i), i === 7 ? false : true));
    expect(parameterEntryStatus(rows)).toMatchObject({ filled: 7, total: 7, complete: true, anyFail: true });
  });
});

describe("visibleReplicateCount / usesDirection", () => {
  it("starts with one slot and grows only from saved index plus Tambah ulangan", () => {
    expect(visibleReplicateCount(0, 0)).toBe(1);
    expect(visibleReplicateCount(1, 0)).toBe(1);
    expect(visibleReplicateCount(1, 1)).toBe(2);
    expect(visibleReplicateCount(5, 0)).toBe(5);
    expect(visibleReplicateCount(0, 9)).toBe(10);
    expect(visibleReplicateCount(10, 0)).toBe(10);
  });
  it("does not special-case VENT_ or AUD_ prefixes (count is independent of parameter code)", () => {
    expect(visibleReplicateCount(0, 0)).toBe(1);
    expect(usesDirection("VENT_PEEP")).toBe(false);
    expect(usesDirection("AUD_PURE_TONE_LINEARITY_KANAN")).toBe(false);
  });
  it("flags only SPHYG_PRESSURE_ACC as a naik/turun parameter", () => {
    expect(usesDirection("SPHYG_PRESSURE_ACC")).toBe(true);
    expect(usesDirection("BSM_HEART_RATE")).toBe(false);
    expect(usesDirection("SUCT_VACUUM_GAUGE")).toBe(false);
  });
});

describe("canAddReplicateSlot", () => {
  it("shows the button when editable and the parameter allows repeated readings", () => {
    expect(canAddReplicateSlot(true, { allowsRepeatedReadings: true })).toBe(true);
  });

  it("hides the button when the parameter does not allow repeated readings, even if editable", () => {
    expect(canAddReplicateSlot(true, { allowsRepeatedReadings: false })).toBe(false);
  });

  it("hides the button when not editable, regardless of allowsRepeatedReadings", () => {
    expect(canAddReplicateSlot(false, { allowsRepeatedReadings: true })).toBe(false);
    expect(canAddReplicateSlot(false, { allowsRepeatedReadings: false })).toBe(false);
  });

  it("is independent of parameter code — no device-specific hardcoding", () => {
    // The predicate takes only the catalog flag, never a code/label — this
    // test exists to pin that contract, not to exercise a specific device.
    expect(canAddReplicateSlot(true, { allowsRepeatedReadings: true })).toBe(true);
  });
});

describe("gridEntryStatus", () => {
  const cell = (
    testPointId: string,
    replicateIndex: number,
    measuredValue: string | null,
    isWithinTolerance: boolean | null,
    measuredText: string | null = null,
  ) => ({
    calibrationTestPointId: testPointId,
    replicateIndex,
    measuredValue,
    measuredText,
    isWithinTolerance,
  });

  const awal = "tp-awal";
  const akhir = "tp-akhir";
  const points = [awal, akhir];

  it("is incomplete when only one of two named points is filled", () => {
    const s = gridEntryStatus([cell(awal, 1, "25.1", true)], points);
    expect(s).toMatchObject({ filled: 1, total: 2, complete: false, anyFail: false });
  });
  it("is complete when every named point has at least one reading", () => {
    const s = gridEntryStatus(
      [cell(awal, 1, "25.1", true), cell(akhir, 1, "25.8", true)],
      points,
    );
    expect(s).toMatchObject({ filled: 2, total: 2, complete: true });
  });
  it("uses test-point ids from data, not hard-coded labels", () => {
    const low = "tp-low";
    const high = "tp-high";
    expect(
      gridEntryStatus([cell(low, 1, "1", true), cell(high, 1, "9", true)], [low, high]),
    ).toMatchObject({ complete: true, filled: 2, total: 2 });
  });
  it("counts a symbol-only reading as filling that point", () => {
    const s = gridEntryStatus(
      [cell(awal, 1, null, null, "OL"), cell(akhir, 1, "25.8", true)],
      points,
    );
    expect(s).toMatchObject({ filled: 2, total: 2, complete: true });
  });
  it("does not require extra replicates once every point has a reading", () => {
    const rows = [
      cell(awal, 1, "25.1", true),
      cell(awal, 2, "25.2", true),
      cell(akhir, 1, "25.8", true),
    ];
    expect(gridEntryStatus(rows, points)).toMatchObject({ filled: 2, total: 2, complete: true });
  });
  it("allows ten replicates without treating them as a completeness target", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((i) => [
      cell(awal, i, String(i), true),
      cell(akhir, i, String(i), true),
    ]);
    expect(gridEntryStatus(rows, points)).toMatchObject({ filled: 2, total: 2, complete: true });
  });
  it("marks anyFail when a saved cell is out of tolerance", () => {
    const rows = [cell(awal, 1, "30", true), cell(akhir, 1, "62", false)];
    expect(gridEntryStatus(rows, points).anyFail).toBe(true);
    expect(gridEntryStatus(rows, points).complete).toBe(true);
  });
  it("is incomplete with zero points or zero readings", () => {
    expect(gridEntryStatus([], points)).toMatchObject({ filled: 0, total: 2, complete: false });
    expect(gridEntryStatus([], [])).toMatchObject({ filled: 0, total: 0, complete: false });
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
    logicalTestKey: null,
    logicalTestSequence: null,
    allowsRepeatedReadings: true,
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

describe("Pattern A vs Pattern B measurement-point labels", () => {
  const tp = (
    id: string,
    sequence: number,
    settingLabel: string,
    settingValue: string | null = null,
  ) => ({ id, sequence, settingLabel, settingValue, toleranceMin: null, toleranceMax: null, toleranceNote: null });

  const param = (
    id: string,
    extras: Partial<TechMeasurementParameter> = {},
  ): TechMeasurementParameter => ({
    id,
    code: id,
    name: id,
    decimalPlaces: 1,
    uom: null,
    toleranceMin: null,
    toleranceMax: null,
    toleranceNote: null,
    capabilityName: "cap",
    capabilityItemName: "item",
    logicalTestKey: null,
    logicalTestSequence: null,
    allowsRepeatedReadings: true,
    ...extras,
  });

  it("Pattern A still displays Ulangan 1, Ulangan 2", () => {
    expect(patternASlotLabels(0, 0)).toEqual(["Ulangan 1"]);
    expect(patternASlotLabels(2, 0)).toEqual(["Ulangan 1", "Ulangan 2"]);
    expect(replicateLabel(1)).toBe("Ulangan 1");
    expect(replicateLabel(2)).toBe("Ulangan 2");
  });

  it("Pattern B shows settingLabel Awal / Akhir, not Ulangan", () => {
    const awal = namedPointGroupView({
      testPoint: tp("tp-a", 1, "Awal"),
      maxExistingReplicateIndex: 1,
      extraSlots: 0,
    });
    const akhir = namedPointGroupView({
      testPoint: tp("tp-b", 2, "Akhir"),
      maxExistingReplicateIndex: 1,
      extraSlots: 0,
    });
    expect(awal.slots.map((s) => s.slotLabel)).toEqual(["Awal"]);
    expect(akhir.slots.map((s) => s.slotLabel)).toEqual(["Akhir"]);
    expect(awal.showGroupHeader).toBe(false);
  });

  it("Pattern B shows L-N / L-G / N-G from data", () => {
    const labels = ["L-N", "L-G", "N-G"].map((label, i) =>
      namedPointGroupView({
        testPoint: tp(`tp-${i}`, i + 1, label),
        maxExistingReplicateIndex: 0,
        extraSlots: 0,
      }).slots[0]?.slotLabel,
    );
    expect(labels).toEqual(["L-N", "L-G", "N-G"]);
  });

  it("orders named points by sequence, not array position", () => {
    const ordered = sortNamedMeasurementPoints([
      tp("tp-akhir", 2, "Akhir"),
      tp("tp-awal", 1, "Awal"),
    ]);
    expect(ordered.map((p) => p.settingLabel)).toEqual(["Awal", "Akhir"]);
  });

  it("keeps nested Ulangan labels only inside a named point with extra repetitions", () => {
    const group = namedPointGroupView({
      testPoint: tp("tp-a", 1, "Awal"),
      maxExistingReplicateIndex: 2,
      extraSlots: 0,
    });
    expect(group.settingLabel).toBe("Awal");
    expect(group.showGroupHeader).toBe(true);
    expect(group.slots.map((s) => ({ index: s.replicateIndex, label: s.slotLabel }))).toEqual([
      { index: 1, label: "Ulangan 1" },
      { index: 2, label: "Ulangan 2" },
    ]);
  });

  it("supports extra Tambah ulangan slots under one named point", () => {
    const group = namedPointGroupView({
      testPoint: tp("tp-a", 1, "Awal"),
      maxExistingReplicateIndex: 1,
      extraSlots: 1,
    });
    expect(group.slots).toHaveLength(2);
    expect(group.slots.map((s) => s.slotLabel)).toEqual(["Ulangan 1", "Ulangan 2"]);
  });

  it("preserves settingValue on the named-point view without using it as identity", () => {
    const group = namedPointGroupView({
      testPoint: tp("tp-a", 1, "Awal", "25 °C"),
      maxExistingReplicateIndex: 1,
      extraSlots: 0,
    });
    expect(group.settingLabel).toBe("Awal");
    expect(group.settingValue).toBe("25 °C");
    expect(group.slots[0]?.slotLabel).toBe("Awal");
  });

  it("uses generic settingLabel values without hardcoded Awal/Akhir conditions", () => {
    for (const label of ["Low", "High", "Before", "After", "Min", "Mid", "Max"] as const) {
      const group = namedPointGroupView({
        testPoint: tp(`tp-${label}`, 1, label),
        maxExistingReplicateIndex: 1,
        extraSlots: 0,
      });
      expect(group.slots[0]?.slotLabel).toBe(label);
    }
  });

  it("does not invent a named label for historical Pattern A (null calibrationTestPointId)", () => {
    const points = [tp("tp-a", 1, "Awal"), tp("tp-b", 2, "Akhir")];
    expect(namedLabelForResult(null, points)).toBeNull();
    expect(namedLabelForResult("tp-a", points)).toBe("Awal");
    expect(namedLabelForResult("unknown", points)).toBeNull();
  });

  it("resolves GRID from job payload test points and DIRECT when snapshot count is 0", () => {
    const gridParam = param("p-b", { testPoints: [tp("tp-1", 1, "Awal"), tp("tp-2", 2, "Akhir")] });
    const directParam = param("p-a");
    const data: TechMeasurementParametersResponse = {
      deviceType: { id: "dt", name: "x" },
      parameters: [directParam],
      gridParameters: [gridParam],
    };
    expect(resolveMeasurementEntryTarget(data, "p-b")?.kind).toBe("GRID");
    expect(resolveMeasurementEntryTarget(data, "p-b")?.param.testPoints?.map((p) => p.settingLabel)).toEqual([
      "Awal",
      "Akhir",
    ]);
    expect(resolveMeasurementEntryTarget(data, "p-a")?.kind).toBe("DIRECT");

    const emptySnapshot: TechMeasurementParametersResponse = {
      deviceType: { id: "dt", name: "x" },
      parameters: [param("p-hist")],
      gridParameters: [param("p-hist", { testPoints: [] })],
    };
    expect(resolveMeasurementEntryTarget(emptySnapshot, "p-hist")?.kind).toBe("DIRECT");
  });

  it("prefers capabilityGroups GRID testPoints when present", () => {
    const grouped = {
      ...param("p-g"),
      kind: "GRID" as const,
      testPoints: [tp("ln", 1, "L-N"), tp("lg", 2, "L-G"), tp("ng", 3, "N-G")],
    };
    const data: TechMeasurementParametersResponse = {
      deviceType: { id: "dt", name: "x" },
      parameters: [],
      gridParameters: [],
      capabilityGroups: [
        {
          capability: { id: "c", code: "C", name: "C" },
          sortOrder: 1,
          parameters: [grouped],
        },
      ],
    };
    const target = resolveMeasurementEntryTarget(data, "p-g");
    expect(target?.kind).toBe("GRID");
    expect(target?.param.testPoints?.map((p) => p.settingLabel)).toEqual(["L-N", "L-G", "N-G"]);
  });

  it("uses testPoints even when the parameter is also listed in parameters[] as DIRECT", () => {
    const named = param("suhu", {
      name: "Suhu Ruangan",
      testPoints: [tp("tp-awal", 1, "Awal"), tp("tp-akhir", 2, "Akhir")],
    });
    const data: TechMeasurementParametersResponse = {
      deviceType: { id: "dt", name: "BSM" },
      parameters: [{ ...named, testPoints: named.testPoints }],
      gridParameters: [],
    };
    const target = resolveMeasurementEntryTarget(data, "suhu");
    expect(target?.kind).toBe("GRID");
    expect(target?.param.testPoints?.map((p) => p.settingLabel)).toEqual(["Awal", "Akhir"]);
  });

  it("uses capabilityGroups testPoints without requiring kind === GRID", () => {
    const grouped = {
      ...param("vin"),
      kind: "DIRECT" as const,
      testPoints: [tp("ln", 1, "L-N"), tp("lg", 2, "L-G"), tp("ng", 3, "N-G")],
    };
    const data: TechMeasurementParametersResponse = {
      deviceType: { id: "dt", name: "x" },
      parameters: [param("vin")],
      gridParameters: [],
      capabilityGroups: [
        {
          capability: { id: "c", code: "C", name: "C" },
          sortOrder: 1,
          parameters: [grouped],
        },
      ],
    };
    expect(resolveMeasurementEntryTarget(data, "vin")?.kind).toBe("GRID");
    expect(resolveMeasurementEntryTarget(data, "vin")?.param.testPoints?.map((p) => p.settingLabel)).toEqual([
      "L-N",
      "L-G",
      "N-G",
    ]);
  });

  it("Suhu Ruangan regression: Awal 25 and Akhir 6 stay named points even when both replicateIndex = 1", () => {
    const points = [tp("tp-akhir", 2, "Akhir"), tp("tp-awal", 1, "Awal")];
    const groups = patternBEntryPresentation(points, [
      { calibrationTestPointId: "tp-awal", replicateIndex: 1, measuredValue: "25" },
      { calibrationTestPointId: "tp-akhir", replicateIndex: 1, measuredValue: "6" },
    ]);
    expect(groups.map((g) => g.settingLabel)).toEqual(["Awal", "Akhir"]);
    expect(groups.map((g) => g.slots.map((s) => s.slotLabel))).toEqual([["Awal"], ["Akhir"]]);
    expect(groups.map((g) => g.slots.map((s) => s.measuredValue))).toEqual([["25"], ["6"]]);
    expect(groups.flatMap((g) => g.slots.map((s) => s.slotLabel)).some((l) => l.startsWith("Ulangan"))).toBe(
      false,
    );
  });

  it("does not collapse two named points into Ulangan 1 / Ulangan 2 by replicateIndex", () => {
    const groups = patternBEntryPresentation(
      [tp("awal", 1, "Awal"), tp("akhir", 2, "Akhir")],
      [
        { calibrationTestPointId: "awal", replicateIndex: 1, measuredValue: "25" },
        { calibrationTestPointId: "akhir", replicateIndex: 1, measuredValue: "6" },
      ],
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]?.slots).toHaveLength(1);
    expect(groups[1]?.slots).toHaveLength(1);
  });

  it("keeps extra Awal repetitions under Awal and extra Akhir repetitions under Akhir", () => {
    const groups = patternBEntryPresentation(
      [tp("awal", 1, "Awal"), tp("akhir", 2, "Akhir")],
      [
        { calibrationTestPointId: "awal", replicateIndex: 1, measuredValue: "25" },
        { calibrationTestPointId: "awal", replicateIndex: 2, measuredValue: "25.1" },
        { calibrationTestPointId: "akhir", replicateIndex: 1, measuredValue: "26" },
        { calibrationTestPointId: "akhir", replicateIndex: 2, measuredValue: "26.2" },
      ],
    );
    expect(groups[0]?.settingLabel).toBe("Awal");
    expect(groups[0]?.slots.map((s) => ({ label: s.slotLabel, value: s.measuredValue }))).toEqual([
      { label: "Ulangan 1", value: "25" },
      { label: "Ulangan 2", value: "25.1" },
    ]);
    expect(groups[1]?.settingLabel).toBe("Akhir");
    expect(groups[1]?.slots.map((s) => ({ label: s.slotLabel, value: s.measuredValue }))).toEqual([
      { label: "Ulangan 1", value: "26" },
      { label: "Ulangan 2", value: "26.2" },
    ]);
  });

  it("ignores historical NULL calibrationTestPointId rows when building Pattern B groups", () => {
    const groups = patternBEntryPresentation(
      [tp("awal", 1, "Awal"), tp("akhir", 2, "Akhir")],
      [
        { calibrationTestPointId: null, replicateIndex: 1, measuredValue: "25" },
        { calibrationTestPointId: null, replicateIndex: 2, measuredValue: "6" },
        { calibrationTestPointId: "awal", replicateIndex: 1, measuredValue: "24.1" },
      ],
    );
    expect(groups.map((g) => g.slots.map((s) => s.measuredValue))).toEqual([["24.1"], [null]]);
    expect(namedLabelForResult(null, [tp("awal", 1, "Awal")])).toBeNull();
  });

  it("Suhu Ruangan with zero snapshot test points remains Pattern A (Ulangan), not invented Awal/Akhir", () => {
    const data: TechMeasurementParametersResponse = {
      deviceType: { id: "dt", name: "Bed Side Monitor" },
      parameters: [param("suhu", { name: "Suhu Ruangan" })],
      gridParameters: [],
    };
    const target = resolveMeasurementEntryTarget(data, "suhu");
    expect(target?.kind).toBe("DIRECT");
    expect(patternASlotLabels(2, 0)).toEqual(["Ulangan 1", "Ulangan 2"]);
  });
});
