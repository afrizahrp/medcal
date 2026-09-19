import { describe, expect, it } from "vitest";
import {
  mapCapabilityMeasurementRows,
  overlaySnapshotTestPointFields,
  type CapabilityParameterForLk,
} from "./lk-measurement-mapping";

function formatToleranceText(min: unknown, max: unknown, note: string | null): string | null {
  if (note?.trim()) return note.trim();
  if (min != null && max != null) return `${min} – ${max}`;
  return null;
}

function param(overrides: Partial<CapabilityParameterForLk> & Pick<CapabilityParameterForLk, "id" | "name">): CapabilityParameterForLk {
  return {
    valueType: "NUMBER",
    decimalPlaces: 1,
    toleranceMin: 20,
    toleranceMax: 30,
    toleranceNote: null,
    uomSymbol: "°C",
    capabilityId: "cap-1",
    capabilityName: "Lingkungan",
    logicalTestKey: null,
    logicalTestSequence: null,
    liveTestPoints: [],
    ...overrides,
  };
}

describe("overlaySnapshotTestPointFields", () => {
  const live = {
    settingLabel: "Live Awal",
    settingValue: 1,
    sequence: 1,
    toleranceMin: 1,
    toleranceMax: 2,
    toleranceNote: "live",
  };
  const frozen = {
    settingLabel: "Snap Awal",
    settingValue: 9,
    sequence: 1,
    toleranceMin: 9,
    toleranceMax: 10,
    toleranceNote: "snap",
  };

  it("uses the job snapshot for a started job named point", () => {
    const map = new Map([["tp-1", frozen]]);
    expect(overlaySnapshotTestPointFields("tp-1", live, map)).toEqual(frozen);
  });

  it("does not fall back to live master when the snapshot map is present", () => {
    const map = new Map([["other", frozen]]);
    expect(overlaySnapshotTestPointFields("tp-1", live, map)).toBeNull();
  });

  it("keeps live catalog fields for PENDING/unfrozen jobs", () => {
    expect(overlaySnapshotTestPointFields("tp-1", live, null)).toEqual(live);
  });

  it("keeps Pattern A (NULL test point id) on live/null overlay", () => {
    expect(overlaySnapshotTestPointFields(null, live, new Map())).toEqual(live);
  });
});

describe("mapCapabilityMeasurementRows", () => {
  it("Pattern A: one row per parameter, joins filled replicates with ', '", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [param({ id: "p-volt", name: "Output Voltage", uomSymbol: "V" })],
      snapshotRows: [],
      results: [
        { deviceCalibrationParameterId: "p-volt", calibrationTestPointId: null, formattedValue: "220.0" },
        { deviceCalibrationParameterId: "p-volt", calibrationTestPointId: null, formattedValue: "221.0" },
        { deviceCalibrationParameterId: "p-volt", calibrationTestPointId: null, formattedValue: "219.5" },
      ],
      formatToleranceText,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.row.label).toBe("Output Voltage (V)");
    expect(rows[0]?.row.value).toBe("220.0, 221.0, 219.5");
  });

  it("Pattern A historical NULL calibrationTestPointId stays on the unnamed row", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [param({ id: "p-temp", name: "Temperature" })],
      snapshotRows: [],
      results: [
        { deviceCalibrationParameterId: "p-temp", calibrationTestPointId: null, formattedValue: "24.0" },
      ],
      formatToleranceText,
    });
    expect(rows[0]?.row.label).toBe("Temperature (°C)");
    expect(rows[0]?.row.value).toBe("24.0");
  });

  it("Pattern B Awal/Akhir uses snapshot labels and sequence, not live master", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [
        param({
          id: "p-temp",
          name: "Temperature",
          liveTestPoints: [
            {
              id: "tp-awal",
              sequence: 1,
              settingLabel: "LIVE RENAMED",
              toleranceMin: 0,
              toleranceMax: 99,
              toleranceNote: "live",
            },
            {
              id: "tp-akhir",
              sequence: 2,
              settingLabel: "LIVE OTHER",
              toleranceMin: 0,
              toleranceMax: 99,
              toleranceNote: "live",
            },
          ],
        }),
      ],
      snapshotRows: [
        {
          deviceCalibrationParameterId: "p-temp",
          sourceCalibrationTestPointId: "tp-akhir",
          sequence: 2,
          settingLabel: "Akhir",
          toleranceMin: 20,
          toleranceMax: 30,
          toleranceNote: "snap akhir",
        },
        {
          deviceCalibrationParameterId: "p-temp",
          sourceCalibrationTestPointId: "tp-awal",
          sequence: 1,
          settingLabel: "Awal",
          toleranceMin: 20,
          toleranceMax: 30,
          toleranceNote: "snap awal",
        },
      ],
      results: [
        { deviceCalibrationParameterId: "p-temp", calibrationTestPointId: "tp-awal", formattedValue: "22.1" },
        { deviceCalibrationParameterId: "p-temp", calibrationTestPointId: "tp-akhir", formattedValue: "23.4" },
      ],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.label)).toEqual(["Temperature — Awal", "Temperature — Akhir"]);
    expect(rows.map((r) => r.row.value)).toEqual(["22.1", "23.4"]);
    expect(rows.map((r) => r.row.toleranceText)).toEqual(["snap awal", "snap akhir"]);
  });

  it("Pattern B L-N / L-G / N-G keeps named point identity and sequence", () => {
    const ids = ["tp-ln", "tp-lg", "tp-ng"] as const;
    const labels = ["L-N", "L-G", "N-G"] as const;
    const rows = mapCapabilityMeasurementRows({
      parameters: [param({ id: "p-vin", name: "Input Voltage", uomSymbol: "Vac" })],
      snapshotRows: labels.map((settingLabel, i) => ({
        deviceCalibrationParameterId: "p-vin",
        sourceCalibrationTestPointId: ids[i]!,
        sequence: i + 1,
        settingLabel,
        toleranceMin: 198,
        toleranceMax: 242,
        toleranceNote: null,
      })),
      results: [
        { deviceCalibrationParameterId: "p-vin", calibrationTestPointId: "tp-ng", formattedValue: "1.2" },
        { deviceCalibrationParameterId: "p-vin", calibrationTestPointId: "tp-ln", formattedValue: "220.0" },
        { deviceCalibrationParameterId: "p-vin", calibrationTestPointId: "tp-lg", formattedValue: "220.1" },
      ],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.label)).toEqual([
      "Input Voltage — L-N",
      "Input Voltage — L-G",
      "Input Voltage — N-G",
    ]);
    expect(rows.map((r) => r.row.value)).toEqual(["220.0", "220.1", "1.2"]);
  });

  it("joins multiple repetitions for one named point with the existing ', ' convention", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [param({ id: "p-temp", name: "Temperature" })],
      snapshotRows: [
        {
          deviceCalibrationParameterId: "p-temp",
          sourceCalibrationTestPointId: "tp-awal",
          sequence: 1,
          settingLabel: "Awal",
          toleranceMin: null,
          toleranceMax: null,
          toleranceNote: null,
        },
      ],
      results: [
        { deviceCalibrationParameterId: "p-temp", calibrationTestPointId: "tp-awal", formattedValue: "22.0" },
        { deviceCalibrationParameterId: "p-temp", calibrationTestPointId: "tp-awal", formattedValue: "22.1" },
        { deviceCalibrationParameterId: "p-temp", calibrationTestPointId: "tp-awal", formattedValue: "22.2" },
      ],
      formatToleranceText,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.row.value).toBe("22.0, 22.1, 22.2");
  });

  it("does not invent BSM-specific rows: any settingLabel works the same", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [param({ id: "p-x", name: "Pressure", uomSymbol: "mmHg" })],
      snapshotRows: [
        {
          deviceCalibrationParameterId: "p-x",
          sourceCalibrationTestPointId: "tp-low",
          sequence: 1,
          settingLabel: "Low",
          toleranceMin: null,
          toleranceMax: null,
          toleranceNote: null,
        },
        {
          deviceCalibrationParameterId: "p-x",
          sourceCalibrationTestPointId: "tp-high",
          sequence: 2,
          settingLabel: "High",
          toleranceMin: null,
          toleranceMax: null,
          toleranceNote: null,
        },
      ],
      results: [
        { deviceCalibrationParameterId: "p-x", calibrationTestPointId: "tp-high", formattedValue: "250" },
      ],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.label)).toEqual(["Pressure — Low", "Pressure — High"]);
    expect(rows[1]?.row.value).toBe("250");
  });
});

/**
 * Phase 4A (Gap A) — several independently measured quantities of one logical
 * test are printed contiguously and in declared order. Row shape, values and
 * tolerance text are unchanged; only the ORDER of the emitted rows is affected.
 */
describe("mapCapabilityMeasurementRows — logical test grouping", () => {
  const dxray = [
    param({
      id: "p-mgy",
      name: "Reproduksibilitas mGy",
      uomSymbol: "mGy",
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 3,
    }),
    param({
      id: "p-kv",
      name: "Reproduksibilitas kV",
      uomSymbol: "kV",
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 1,
    }),
    param({
      id: "p-s",
      name: "Reproduksibilitas s",
      uomSymbol: "s",
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 2,
    }),
  ];

  it("prints the quantities of one logical test in declared order", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: dxray,
      snapshotRows: null,
      results: [
        { deviceCalibrationParameterId: "p-kv", calibrationTestPointId: null, formattedValue: "70" },
        { deviceCalibrationParameterId: "p-s", calibrationTestPointId: null, formattedValue: "0.2" },
        {
          deviceCalibrationParameterId: "p-mgy",
          calibrationTestPointId: null,
          formattedValue: "1.8",
        },
      ],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.label)).toEqual([
      "Reproduksibilitas kV (kV)",
      "Reproduksibilitas s (s)",
      "Reproduksibilitas mGy (mGy)",
    ]);
    expect(rows.map((r) => r.row.value)).toEqual(["70", "0.2", "1.8"]);
  });

  it("keeps the group contiguous without moving the parameters around it", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [
        param({ id: "p-first", name: "Kolimasi" }),
        dxray[1]!,
        param({ id: "p-mid", name: "HVL" }),
        dxray[0]!,
        dxray[2]!,
        param({ id: "p-last", name: "Akurasi kV" }),
      ],
      snapshotRows: null,
      results: [],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.label)).toEqual([
      "Kolimasi (°C)",
      "Reproduksibilitas kV (kV)",
      "Reproduksibilitas s (s)",
      "Reproduksibilitas mGy (mGy)",
      "HVL (°C)",
      "Akurasi kV (°C)",
    ]);
  });

  it("leaves an ungrouped catalog in exactly its previous order", () => {
    const parameters = [
      param({ id: "p-1", name: "Suhu" }),
      param({ id: "p-2", name: "RH" }),
      param({ id: "p-3", name: "Tegangan" }),
    ];
    const rows = mapCapabilityMeasurementRows({
      parameters,
      snapshotRows: null,
      results: [],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.label)).toEqual(["Suhu (°C)", "RH (°C)", "Tegangan (°C)"]);
  });

  it("still expands a grouped quantity's own named test points (Pattern B)", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [
        param({
          id: "p-a",
          name: "Stage",
          logicalTestKey: "micro-4x",
          logicalTestSequence: 2,
          liveTestPoints: [
            {
              id: "tp-1",
              sequence: 1,
              settingLabel: "10 µm",
              toleranceMin: null,
              toleranceMax: null,
              toleranceNote: null,
            },
          ],
        }),
        param({ id: "p-b", name: "Okuler", logicalTestKey: "micro-4x", logicalTestSequence: 1 }),
      ],
      snapshotRows: null,
      results: [],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.label)).toEqual(["Okuler (°C)", "Stage — 10 µm"]);
  });

  it("does not let grouping pull a historical NULL-test-point result into another row", () => {
    const rows = mapCapabilityMeasurementRows({
      parameters: [dxray[1]!, dxray[2]!],
      snapshotRows: null,
      results: [
        { deviceCalibrationParameterId: "p-kv", calibrationTestPointId: null, formattedValue: "70" },
      ],
      formatToleranceText,
    });
    expect(rows.map((r) => r.row.value)).toEqual(["70", "—"]);
  });
});
