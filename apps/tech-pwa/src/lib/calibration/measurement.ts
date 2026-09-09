import type { CalibrationJobStatus } from "./types";

/**
 * Measurement entry — Pattern A (direct replicates) + Pattern B (test-point grid).
 *
 * Pattern A = NUMBER, DIRECT_REPLICATES, active, no CalibrationTestPoint children.
 * Pattern B = the same filters except they HAVE active test-point children
 * (`gridParameters` on GET .../measurement-parameters). LOGGER_SUMMARY and
 * SUCT_VACUUM_GAUGE are excluded server-side. REWORK / attempt increment is a
 * future plan — the UI still filters `attemptNumber === currentAttempt`.
 *
 * Local mirrors of the apps/api shapes — dates as ISO strings, Prisma Decimal as
 * numeric string (same wire representation the rest of this API uses).
 */

// ── API response mirrors ─────────────────────────────────────────────────────

export interface TechMeasurementTestPoint {
  id: string;
  sequence: number;
  settingLabel: string;
  settingValue: string | null;
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceNote: string | null;
}

export interface TechMeasurementParameter {
  id: string;
  code: string;
  name: string;
  /**
   * Digits after the decimal point for the measured value. Placeholder `0`
   * catalog-wide today — read it, never hardcode; entry formatting becomes
   * correct automatically once the backfill lands.
   */
  decimalPlaces: number | null;
  uom: { code: string; symbol: string } | null;
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceNote: string | null;
  capabilityName: string;
  capabilityItemName: string;
  /** Present and non-empty on Pattern B (`gridParameters`). Absent or [] on A. */
  testPoints?: TechMeasurementTestPoint[];
}

/** Direct replicate list vs test-point grid — same eligibility as parameters[] / gridParameters. */
export type MeasurementParameterKind = "DIRECT" | "GRID";

export interface TechMeasurementCapabilityRef {
  id: string;
  code: string;
  name: string;
}

export interface TechMeasurementGroupedParameter extends TechMeasurementParameter {
  kind: MeasurementParameterKind;
  testPoints: TechMeasurementTestPoint[];
}

export interface TechMeasurementCapabilityGroup {
  capability: TechMeasurementCapabilityRef;
  /** Persisted per-DeviceType order; null when no DeviceTypeCapabilityOrder row exists. */
  sortOrder: number | null;
  parameters: TechMeasurementGroupedParameter[];
}

export interface TechMeasurementParametersResponse {
  deviceType: { id: string; name: string } | null;
  parameters: TechMeasurementParameter[];
  gridParameters: TechMeasurementParameter[];
  /**
   * LK-oriented tree from GET .../measurement-parameters. Optional so a
   * pre-Phase-1 payload can still render the input-method fallback.
   */
  capabilityGroups?: TechMeasurementCapabilityGroup[];
}

/** True when the additive capability tree is present (including an empty list). */
export function hasCapabilityGroups(
  groups: TechMeasurementCapabilityGroup[] | null | undefined,
): groups is TechMeasurementCapabilityGroup[] {
  return Array.isArray(groups);
}

export interface MeasurementCapabilitySectionView {
  id: string;
  name: string;
  parameters: Array<{
    parameter: TechMeasurementGroupedParameter;
    pointCount: number | undefined;
  }>;
}

/**
 * Presentation walk of `capabilityGroups`. Preserves API order — callers must
 * not sort the result. `pointCount` is set only for GRID so existing status
 * helpers keep their direct vs grid behavior.
 */
export function capabilityGroupSections(
  groups: TechMeasurementCapabilityGroup[],
): MeasurementCapabilitySectionView[] {
  return groups.map((group) => ({
    id: group.capability.id,
    name: group.capability.name,
    parameters: group.parameters.map((parameter) => ({
      parameter,
      pointCount: parameter.kind === "GRID" ? (parameter.testPoints?.length ?? 0) : undefined,
    })),
  }));
}

export type MeasurementDirection = "NONE" | "UP" | "DOWN";
export type MeasurementEntryKind = "DIRECT_READING" | "LOGGER_SUMMARY";

/** One recorded reading — the row the create/batch/update/list endpoints return. */
export interface TechMeasurementResult {
  id: string;
  calibrationJobId: string;
  deviceCalibrationParameterId: string;
  calibrationTestPointId: string | null;
  replicateIndex: number;
  attemptNumber: number;
  direction: MeasurementDirection;
  entryKind: MeasurementEntryKind;
  measuredValue: string | null;
  referenceValue: string | null;
  measuredBool: boolean | null;
  measuredText: string | null;
  uomId: string | null;
  isWithinTolerance: boolean | null;
  effectiveToleranceMin: string | null;
  effectiveToleranceMax: string | null;
  appliedNominalValue: string | null;
  attachmentFileObjectId: string | null;
  recordedByUserId: string | null;
  note: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** One item of the `POST .../measurement-results/batch` body. */
export interface MeasurementBatchItem {
  deviceCalibrationParameterId: string;
  calibrationTestPointId?: string | null;
  replicateIndex: number;
  direction?: MeasurementDirection;
  measuredValue: string;
}

/** The editable subset for `PATCH .../measurement-results/:id`. */
export interface MeasurementUpdateInput {
  measuredValue: string;
}

// ── Replicate-count soft default ─────────────────────────────────────────────

/**
 * There is NO structural "expected replicate count" anywhere — not on
 * DeviceCalibrationParameter, not on CalibrationTestPoint. The LK worksheets
 * imply it only by convention: nearly every performance table has trial columns
 * "I–V". So the entry UI seeds this many rows and offers an "add replicate"
 * affordance; a job that genuinely needs more (or fewer) is never blocked.
 * Known soft spot — see the Stage A report.
 */
export const DEFAULT_REPLICATE_COUNT = 5;

const THREE_REPLICATE_PREFIXES = ["VENT_", "AUD_"] as const;
const DIRECTION_PARAMETER_CODES = new Set(["SPHYG_PRESSURE_ACC"]);

/** Soft default column count for a Pattern B grid (no catalog field exists). */
export function expectedReplicateCount(code: string): number {
  return THREE_REPLICATE_PREFIXES.some((prefix) => code.startsWith(prefix)) ? 3 : DEFAULT_REPLICATE_COUNT;
}

/** True when each setpoint is recorded naik + turun (two natural-key rows). */
export function usesDirection(code: string): boolean {
  return DIRECTION_PARAMETER_CODES.has(code);
}

// ── Lock state (mirrors MEASUREMENT_LOCKED_JOB_STATUSES in the API) ───────────

const MEASUREMENT_LOCKED_JOB_STATUSES: readonly CalibrationJobStatus[] = [
  "SUBMITTED",
  "ACCEPTED_BY_QA",
];

export function isMeasurementLocked(job: { status: CalibrationJobStatus }): boolean {
  return MEASUREMENT_LOCKED_JOB_STATUSES.includes(job.status);
}

/** Entry is possible only while the job's current attempt is IN_PROGRESS. */
export function canRecordMeasurement(job: {
  status: CalibrationJobStatus;
  startedAt: string | null;
}): boolean {
  return job.status === "IN_PROGRESS" && job.startedAt !== null;
}

/** Human reason the entry UI is read-only, or null when it is editable. */
export function measurementLockedReason(job: {
  status: CalibrationJobStatus;
  startedAt: string | null;
}): string | null {
  if (job.startedAt === null || job.status === "PENDING") {
    return "Job belum dimulai — hasil pengukuran dicatat setelah kalibrasi berjalan.";
  }
  if (isMeasurementLocked(job)) {
    return "Job sudah dikirim — hasil pengukuran terkunci.";
  }
  if (job.status === "REWORK") {
    return "Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat hasil.";
  }
  if (job.status !== "IN_PROGRESS") {
    return "Hasil pengukuran hanya dapat dicatat saat job berlangsung.";
  }
  return null;
}

// ── Formatting / verdict helpers (pure — unit-tested) ────────────────────────

/**
 * Format a raw measured value to the parameter's precision for DISPLAY.
 * `decimalPlaces` null/0 → whole number. Never used to transform the value sent
 * to the API — the raw string is submitted and stored at full precision.
 */
export function formatMeasuredValue(
  raw: string | number | null | undefined,
  decimalPlaces: number | null | undefined,
): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  const dp = Math.max(0, decimalPlaces ?? 0);
  return n.toFixed(dp);
}

/** `inputMode`/`step` for the numeric entry field given the parameter precision. */
export function measuredValueInputStep(decimalPlaces: number | null | undefined): string {
  const dp = Math.max(0, decimalPlaces ?? 0);
  return dp === 0 ? "1" : `0.${"0".repeat(dp - 1)}1`;
}

/** True when the string is a plain decimal the API's measurementDecimalInput accepts. */
export function isValidMeasuredValue(raw: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(raw.trim());
}

/**
 * Human-readable acceptance limit for a parameter. Prefers the verbatim LK
 * wording (`toleranceNote`); falls back to the resolved bounds.
 */
export function toleranceText(param: {
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceNote: string | null;
  uom: { symbol: string } | null;
}): string {
  const note = param.toleranceNote?.trim();
  if (note) return note;
  const unit = param.uom?.symbol ? ` ${param.uom.symbol}` : "";
  const { toleranceMin: min, toleranceMax: max } = param;
  if (min !== null && max !== null) return `${min}${unit} – ${max}${unit}`;
  if (min !== null) return `≥ ${min}${unit}`;
  if (max !== null) return `≤ ${max}${unit}`;
  return "Tanpa toleransi terukur";
}

export type PassFailTone = "pass" | "fail" | "unknown";

export interface PassFailChip {
  tone: PassFailTone;
  label: string;
  className: string;
}

const CHIP_CLASS: Record<PassFailTone, string> = {
  pass: "bg-emerald-100 text-emerald-800",
  fail: "bg-red-100 text-red-800",
  unknown: "bg-slate-100 text-slate-600",
};

/**
 * Pass/fail chip for a saved reading. `isWithinTolerance` comes straight from the
 * write response — no second round-trip. `null` = the API could not evaluate it
 * automatically (no computable tolerance); shown neutrally, judged at QA.
 */
export function passFailChip(isWithinTolerance: boolean | null): PassFailChip {
  if (isWithinTolerance === true) {
    return { tone: "pass", label: "Sesuai", className: CHIP_CLASS.pass };
  }
  if (isWithinTolerance === false) {
    return { tone: "fail", label: "Tidak sesuai", className: CHIP_CLASS.fail };
  }
  return { tone: "unknown", label: "Perlu telaah", className: CHIP_CLASS.unknown };
}

// ── Per-parameter entry-status summary (list screen) ─────────────────────────

export interface ParameterEntryStatus {
  filled: number;
  total: number;
  complete: boolean;
  anyFail: boolean;
}

/**
 * Fold a parameter's readings (already filtered to the current attempt, Pattern
 * A) into a "n/total diisi" summary. `total` is the larger of the seeded default
 * and however many replicates already exist.
 */
export function parameterEntryStatus(
  rows: Pick<TechMeasurementResult, "replicateIndex" | "measuredValue" | "isWithinTolerance">[],
  defaultCount = DEFAULT_REPLICATE_COUNT,
): ParameterEntryStatus {
  const withValue = rows.filter((r) => r.measuredValue !== null && r.measuredValue !== "");
  const maxIndex = rows.reduce((m, r) => Math.max(m, r.replicateIndex), 0);
  const total = Math.max(defaultCount, maxIndex);
  return {
    filled: withValue.length,
    total,
    complete: withValue.length >= total && withValue.length > 0,
    anyFail: withValue.some((r) => r.isWithinTolerance === false),
  };
}

/**
 * Fold a Pattern B grid (already filtered to the current attempt) into a
 * "n/total cells" summary. `total` = points × max(expected, max replicateIndex)
 * × directions (1 or 2).
 */
export function gridEntryStatus(
  rows: Pick<TechMeasurementResult, "replicateIndex" | "measuredValue" | "isWithinTolerance">[],
  testPointCount: number,
  expectedReplicates: number,
  directionCount = 1,
): ParameterEntryStatus {
  const withValue = rows.filter((r) => r.measuredValue !== null && r.measuredValue !== "");
  const maxIndex = rows.reduce((m, r) => Math.max(m, r.replicateIndex), 0);
  const replicateCount = Math.max(expectedReplicates, maxIndex);
  const total = Math.max(0, testPointCount) * replicateCount * Math.max(1, directionCount);
  return {
    filled: withValue.length,
    total,
    complete: total > 0 && withValue.length >= total,
    anyFail: withValue.some((r) => r.isWithinTolerance === false),
  };
}
