import { describe, expect, it } from "vitest";
import {
  evaluateMeasurementCompleteness,
  isMeasurementReadingFilled,
} from "./measurement-completeness";

describe("isMeasurementReadingFilled", () => {
  it("treats numeric measuredValue as filled", () => {
    expect(isMeasurementReadingFilled({ measuredValue: 22.1, measuredText: null })).toBe(true);
    expect(isMeasurementReadingFilled({ measuredValue: "0", measuredText: null })).toBe(true);
  });
  it("treats non-empty measuredText (symbol) as filled", () => {
    expect(isMeasurementReadingFilled({ measuredValue: null, measuredText: "OL" })).toBe(true);
    expect(isMeasurementReadingFilled({ measuredValue: null, measuredText: "√" })).toBe(true);
    expect(isMeasurementReadingFilled({ measuredValue: null, measuredText: "—" })).toBe(true);
  });
  it("treats empty rows as not filled", () => {
    expect(isMeasurementReadingFilled({ measuredValue: null, measuredText: null })).toBe(false);
    expect(isMeasurementReadingFilled({ measuredValue: null, measuredText: "" })).toBe(false);
    expect(isMeasurementReadingFilled({ measuredValue: null, measuredText: "  " })).toBe(false);
    expect(isMeasurementReadingFilled({ measuredValue: "", measuredText: null })).toBe(false);
  });
});

describe("evaluateMeasurementCompleteness", () => {
  const paramA = "param-a";
  const paramB = "param-b";
  const awal = "tp-awal";
  const akhir = "tp-akhir";

  it("Pattern A: 0 filled → incomplete", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramA],
        snapshotRows: [],
        results: [],
      }),
    ).toEqual({ complete: false, parameters: [{ parameterId: paramA, missingTestPointIds: [] }] });
  });

  it("Pattern A: 1 filled → complete", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramA],
        snapshotRows: [],
        results: [
          {
            deviceCalibrationParameterId: paramA,
            calibrationTestPointId: null,
            measuredValue: 1,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(true);
  });

  it("Pattern A: multiple filled including fewer than 5, 5, and >5 → complete", () => {
    for (const n of [2, 4, 5, 10]) {
      const results = Array.from({ length: n }, (_, i) => ({
        deviceCalibrationParameterId: paramA,
        calibrationTestPointId: null,
        measuredValue: i + 1,
        measuredText: null,
      }));
      expect(
        evaluateMeasurementCompleteness({
          eligibleParameterIds: [paramA],
          snapshotRows: [],
          results,
        }).complete,
        `${n} filled`,
      ).toBe(true);
    }
  });

  it("Pattern A: empty DB row only → incomplete", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramA],
        snapshotRows: [],
        results: [
          {
            deviceCalibrationParameterId: paramA,
            calibrationTestPointId: null,
            measuredValue: null,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(false);
  });

  it("Pattern B: all named points filled → complete", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramB],
        snapshotRows: [
          { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: awal },
          { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: akhir },
        ],
        results: [
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: awal,
            measuredValue: 25,
            measuredText: null,
          },
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: akhir,
            measuredValue: 26,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(true);
  });

  it("Pattern B: one named point missing → incomplete", () => {
    const verdict = evaluateMeasurementCompleteness({
      eligibleParameterIds: [paramB],
      snapshotRows: [
        { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: awal },
        { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: akhir },
      ],
      results: [
        {
          deviceCalibrationParameterId: paramB,
          calibrationTestPointId: awal,
          measuredValue: 25,
          measuredText: null,
        },
      ],
    });
    expect(verdict).toEqual({
      complete: false,
      parameters: [{ parameterId: paramB, missingTestPointIds: [akhir] }],
    });
  });

  it("Pattern B: unequal repetition counts still complete when each point has ≥1 filled", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramB],
        snapshotRows: [
          { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: awal },
          { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: akhir },
        ],
        results: [
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: awal,
            measuredValue: 1,
            measuredText: null,
          },
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: awal,
            measuredValue: 2,
            measuredText: null,
          },
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: awal,
            measuredValue: null,
            measuredText: null,
          },
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: akhir,
            measuredValue: 3,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(true);
  });

  it("Pattern B: NULL calibrationTestPointId does not satisfy a named point", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramB],
        snapshotRows: [
          { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: awal },
        ],
        results: [
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: null,
            measuredValue: 25,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(false);
  });

  it("Pattern B: live master TP not in snapshot does not satisfy snapshot completeness", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramB],
        snapshotRows: [
          { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: awal },
        ],
        results: [
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: "live-not-in-snapshot",
            measuredValue: 1,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(false);
  });

  it("SYMBOL non-empty measuredText is filled; empty is not", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramA],
        snapshotRows: [],
        results: [
          {
            deviceCalibrationParameterId: paramA,
            calibrationTestPointId: null,
            measuredValue: null,
            measuredText: "OL",
          },
        ],
      }).complete,
    ).toBe(true);
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramA],
        snapshotRows: [],
        results: [
          {
            deviceCalibrationParameterId: paramA,
            calibrationTestPointId: null,
            measuredValue: null,
            measuredText: "  ",
          },
        ],
      }).complete,
    ).toBe(false);
  });

  it("filled out-of-tolerance still completes (tolerance is not the criterion)", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramA],
        snapshotRows: [],
        results: [
          {
            deviceCalibrationParameterId: paramA,
            calibrationTestPointId: null,
            measuredValue: 999,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(true);
  });

  it("UP/DOWN: one filled result for the named point is sufficient", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramB],
        snapshotRows: [
          { deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: awal },
        ],
        results: [
          {
            deviceCalibrationParameterId: paramB,
            calibrationTestPointId: awal,
            measuredValue: 80,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(true);
  });

  it("zero eligible parameters is complete", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [],
        snapshotRows: [],
        results: [],
      }).complete,
    ).toBe(true);
  });

  it("historical env with zero snapshot points is Pattern A (not Awal/Akhir)", () => {
    const env = "bsm-room-temp";
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [env],
        snapshotRows: [],
        results: [
          {
            deviceCalibrationParameterId: env,
            calibrationTestPointId: null,
            measuredValue: 25.1,
            measuredText: null,
          },
        ],
      }).complete,
    ).toBe(true);
  });

  it("excluding every Pattern B point does not fall back to Pattern A unnamed reading", () => {
    expect(
      evaluateMeasurementCompleteness({
        eligibleParameterIds: [paramB],
        snapshotRows: [],
        frozenPatternBParameterIds: [paramB],
        results: [],
      }).complete,
    ).toBe(true);
  });

  it("remaining Pattern B points stay required after a sibling is excluded", () => {
    const verdict = evaluateMeasurementCompleteness({
      eligibleParameterIds: [paramB],
      snapshotRows: [{ deviceCalibrationParameterId: paramB, sourceCalibrationTestPointId: awal }],
      frozenPatternBParameterIds: [paramB],
      results: [],
    });
    expect(verdict).toEqual({
      complete: false,
      parameters: [{ parameterId: paramB, missingTestPointIds: [awal] }],
    });
  });
});
