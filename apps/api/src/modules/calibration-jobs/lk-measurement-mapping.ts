import type { LkResultPdfRow } from "./lk-result-pdf";
import { orderByLogicalTest } from "./logical-test-grouping";

export interface FrozenTestPointFields {
  settingLabel: string;
  settingValue: number | null;
  sequence: number;
  toleranceMin: unknown;
  toleranceMax: unknown;
  toleranceNote: string | null;
}

/**
 * For a started job, document labels/settings come from JobCalibrationTestPoint.
 * Live master fields are used only when there is no snapshot overlay (PENDING /
 * unfrozen) or the result has no TP id (Pattern A).
 */
export function overlaySnapshotTestPointFields(
  calibrationTestPointId: string | null,
  live: FrozenTestPointFields | null,
  snapshotBySourceId: Map<string, FrozenTestPointFields> | null,
): FrozenTestPointFields | null {
  if (calibrationTestPointId && snapshotBySourceId) {
    const frozen = snapshotBySourceId.get(calibrationTestPointId);
    if (frozen) return frozen;
    return null;
  }
  return live;
}

export interface CapabilityParameterForLk {
  id: string;
  name: string;
  valueType: string;
  decimalPlaces: number | null;
  toleranceMin: unknown;
  toleranceMax: unknown;
  toleranceNote: string | null;
  uomSymbol: string | null;
  capabilityId: string;
  capabilityName: string;
  /**
   * Phase 4A (Gap A) — catalog grouping. Parameters sharing a key are the
   * measured quantities of one logical test and are printed contiguously, in
   * `logicalTestSequence` order. NULL (every legacy row) = standalone.
   */
  logicalTestKey: string | null;
  logicalTestSequence: number | null;
  liveTestPoints: Array<{
    id: string;
    sequence: number;
    settingLabel: string;
    toleranceMin: unknown;
    toleranceMax: unknown;
    toleranceNote: string | null;
  }>;
}

export interface SnapshotPointForLk {
  deviceCalibrationParameterId: string;
  sourceCalibrationTestPointId: string;
  sequence: number;
  settingLabel: string;
  toleranceMin: unknown;
  toleranceMax: unknown;
  toleranceNote: string | null;
}

export interface ResultForLkRow {
  deviceCalibrationParameterId: string;
  calibrationTestPointId: string | null;
  formattedValue: string | null;
}

/**
 * Generic LK measurement rows: Pattern A = one row per parameter;
 * Pattern B = one row per snapshot (or live, if unfrozen) named point.
 * Multiple filled results for the same point are joined with ", "
 * (existing generic PDF convention — not a new aggregate).
 *
 * Phase 4A (Gap A): parameters declared as quantities of the same logical test
 * are emitted contiguously and in their declared order, at the position of the
 * group's first member. Row shape, values and tolerance text are unchanged, and
 * a catalog with no grouping produces byte-identical rows to before.
 */
export function mapCapabilityMeasurementRows(input: {
  parameters: CapabilityParameterForLk[];
  snapshotRows: SnapshotPointForLk[] | null;
  results: ResultForLkRow[];
  formatToleranceText: (min: unknown, max: unknown, note: string | null) => string | null;
}): Array<{ capabilityId: string; capabilityName: string; row: LkResultPdfRow }> {
  const frozenByParameterId = new Map<string, SnapshotPointForLk[]>();
  if (input.snapshotRows) {
    for (const row of input.snapshotRows) {
      const list = frozenByParameterId.get(row.deviceCalibrationParameterId) ?? [];
      list.push(row);
      frozenByParameterId.set(row.deviceCalibrationParameterId, list);
    }
    for (const [parameterId, list] of frozenByParameterId) {
      frozenByParameterId.set(
        parameterId,
        [...list].sort((a, b) => a.sequence - b.sequence),
      );
    }
  }

  const resultsByKey = new Map<string, ResultForLkRow[]>();
  for (const result of input.results) {
    const key = `${result.deviceCalibrationParameterId}:${result.calibrationTestPointId ?? "none"}`;
    const bucket = resultsByKey.get(key);
    if (bucket) bucket.push(result);
    else resultsByKey.set(key, [result]);
  }

  const out: Array<{ capabilityId: string; capabilityName: string; row: LkResultPdfRow }> = [];

  for (const parameter of orderByLogicalTest(input.parameters)) {
    const catalogPoints =
      input.snapshotRows != null
        ? (frozenByParameterId.get(parameter.id) ?? []).map((tp) => ({
            id: tp.sourceCalibrationTestPointId,
            sequence: tp.sequence,
            settingLabel: tp.settingLabel,
            toleranceMin: tp.toleranceMin,
            toleranceMax: tp.toleranceMax,
            toleranceNote: tp.toleranceNote,
          }))
        : parameter.liveTestPoints;

    const points =
      catalogPoints.length > 0
        ? catalogPoints.map((tp) => ({
            key: `${parameter.id}:${tp.id}`,
            label: `${parameter.name} — ${tp.settingLabel}`,
            toleranceMin: tp.toleranceMin ?? parameter.toleranceMin,
            toleranceMax: tp.toleranceMax ?? parameter.toleranceMax,
            toleranceNote: tp.toleranceNote ?? parameter.toleranceNote,
          }))
        : [
            {
              key: `${parameter.id}:none`,
              label: parameter.uomSymbol
                ? `${parameter.name} (${parameter.uomSymbol})`
                : parameter.name,
              toleranceMin: parameter.toleranceMin,
              toleranceMax: parameter.toleranceMax,
              toleranceNote: parameter.toleranceNote,
            },
          ];

    for (const point of points) {
      const matched = resultsByKey.get(point.key) ?? [];
      const values = matched.map((r) => r.formattedValue).filter((v): v is string => v !== null && v !== "");
      out.push({
        capabilityId: parameter.capabilityId,
        capabilityName: parameter.capabilityName,
        row: {
          label: point.label,
          value: values.length > 0 ? values.join(", ") : "—",
          toleranceText: input.formatToleranceText(
            point.toleranceMin,
            point.toleranceMax,
            point.toleranceNote,
          ),
        },
      });
    }
  }

  return out;
}
