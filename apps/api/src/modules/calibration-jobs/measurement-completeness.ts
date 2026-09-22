/**
 * Measurement completeness for submitForReview.
 *
 * Filled semantics match Tech-PWA `isReadingFilled` (Phase 1): measuredValue
 * non-null/non-empty OR measuredText.trim() non-empty. Pattern A/B for a
 * started job is determined only from JobCalibrationTestPoint snapshot rows.
 */

export const MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES: readonly string[] = [
  "SUCT_VACUUM_GAUGE",
];

export const CALIBRATION_MEASUREMENTS_INCOMPLETE = "CALIBRATION_MEASUREMENTS_INCOMPLETE";

export interface MeasurementCompletenessParameterGap {
  parameterId: string;
  /** Empty for Pattern A (need ≥1 unnamed filled result). Master TP ids for Pattern B. */
  missingTestPointIds: string[];
}

export interface MeasurementCompletenessResult {
  complete: boolean;
  parameters: MeasurementCompletenessParameterGap[];
}

export function isMeasurementReadingFilled(row: {
  measuredValue: { toString(): string } | string | number | null;
  measuredText: string | null;
}): boolean {
  if (row.measuredValue !== null && row.measuredValue !== "") return true;
  return row.measuredText !== null && row.measuredText.trim() !== "";
}

export function evaluateMeasurementCompleteness(input: {
  eligibleParameterIds: readonly string[];
  snapshotRows: readonly {
    deviceCalibrationParameterId: string;
    sourceCalibrationTestPointId: string;
  }[];
  results: readonly {
    deviceCalibrationParameterId: string;
    calibrationTestPointId: string | null;
    measuredValue: { toString(): string } | string | number | null;
    measuredText: string | null;
  }[];
  /**
   * Parameter ids that had named snapshot rows at freeze (including later
   * excluded rows). Prevents Pattern B → Pattern A fallback when every named
   * point of a parameter is excluded from the worksheet.
   */
  frozenPatternBParameterIds?: readonly string[];
}): MeasurementCompletenessResult {
  const requiredByParameter = new Map<string, string[]>();
  for (const parameterId of input.eligibleParameterIds) {
    requiredByParameter.set(parameterId, []);
  }
  for (const row of input.snapshotRows) {
    const list = requiredByParameter.get(row.deviceCalibrationParameterId);
    if (!list) continue;
    list.push(row.sourceCalibrationTestPointId);
  }

  const filledUnnamed = new Set<string>();
  const filledNamed = new Set<string>();
  for (const row of input.results) {
    if (!isMeasurementReadingFilled(row)) continue;
    if (row.calibrationTestPointId === null) {
      filledUnnamed.add(row.deviceCalibrationParameterId);
      continue;
    }
    filledNamed.add(`${row.deviceCalibrationParameterId}:${row.calibrationTestPointId}`);
  }

  const patternB = new Set(input.frozenPatternBParameterIds ?? []);
  const gaps: MeasurementCompletenessParameterGap[] = [];
  for (const [parameterId, sourceIds] of requiredByParameter) {
    if (sourceIds.length === 0) {
      if (patternB.has(parameterId)) continue;
      if (!filledUnnamed.has(parameterId)) {
        gaps.push({ parameterId, missingTestPointIds: [] });
      }
      continue;
    }
    const missingTestPointIds = sourceIds.filter(
      (sourceId) => !filledNamed.has(`${parameterId}:${sourceId}`),
    );
    if (missingTestPointIds.length > 0) {
      gaps.push({ parameterId, missingTestPointIds });
    }
  }

  return { complete: gaps.length === 0, parameters: gaps };
}
