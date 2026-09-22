import {
  isMeasuredValueNumericShape,
  measuredValueDecimalPlacesExceededMessage,
  validateMeasuredValuePrecision,
  type MeasuredValuePrecisionResult,
} from "@medcal/shared";
import type { CalibrationJobStatus } from "./types";

export {
  isMeasuredValueNumericShape,
  measuredValueDecimalPlacesExceededMessage,
  validateMeasuredValuePrecision,
  type MeasuredValuePrecisionResult,
};

/** Zod caps measuredText at 500; keep the client gate aligned. */
export const MEASURED_TEXT_MAX_LENGTH = 500;

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
  /** `false` = strict `>`. Missing or true = inclusive `≥`. */
  toleranceMinInclusive?: boolean;
  /** `false` = strict `<`. Missing or true = inclusive `≤`. */
  toleranceMaxInclusive?: boolean;
  toleranceNote: string | null;
  capabilityName: string;
  capabilityItemName: string;
  /**
   * Phase 4A (Gap A) — catalog grouping. Non-null when this parameter is one
   * measured quantity of a multi-quantity logical test (Dental X-Ray kV + s +
   * mGy). The API already returns members of the same logical test contiguously
   * and in `logicalTestSequence` order, so entry needs no special handling: each
   * quantity is still an ordinary Pattern A / Pattern B parameter with its own
   * replicates, tolerance and verdict.
   */
  logicalTestKey: string | null;
  logicalTestSequence: number | null;
  /**
   * Repetition UX (2026-09-20). Whether the "+ Tambah ulangan" control should
   * be offered for this parameter's applicable points. Presentation only:
   * `visibleReplicateCount` still shows every existing reading regardless of
   * this flag — it only gates the manual grow-the-slot-count affordance.
   */
  allowsRepeatedReadings: boolean;
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
  measuredValue: string | null;
  measuredText?: string | null;
}

/** The editable subset for `PATCH .../measurement-results/:id`. */
export interface MeasurementUpdateInput {
  measuredValue: string | null;
  measuredText?: string | null;
}

/** Display / hydrate value for a saved reading (numeric preferred, else symbol). */
export function readingDisplayValue(
  row: Pick<TechMeasurementResult, "measuredValue" | "measuredText"> | null | undefined,
): string {
  if (!row) return "";
  if (row.measuredValue !== null && row.measuredValue !== "") return row.measuredValue;
  if (row.measuredText !== null && row.measuredText !== "") return row.measuredText;
  return "";
}

/** True when a saved row has either a numeric or symbol reading. */
export function isReadingFilled(
  row: Pick<TechMeasurementResult, "measuredValue" | "measuredText">,
): boolean {
  return (
    (row.measuredValue !== null && row.measuredValue !== "") ||
    (row.measuredText !== null && row.measuredText.trim() !== "")
  );
}

export type MeasuredReadingPayload = {
  measuredValue: string | null;
  measuredText: string | null;
};

export type MeasuredDraftValidation =
  | { ok: true; kind: "empty" }
  | { ok: true; kind: "numeric"; payload: MeasuredReadingPayload }
  | { ok: true; kind: "symbol"; payload: MeasuredReadingPayload }
  | { ok: false; reason: "invalid_format" }
  | { ok: false; reason: "decimal_places_exceeded"; decimalPlaces: number }
  | { ok: false; reason: "symbol_too_long"; maxLength: number };

/**
 * Validate a draft cell and route it to measuredValue vs measuredText.
 * Numeric shape keeps the existing precision rules; any other non-empty
 * trimmed string is a symbol/text reading (sibling field cleared).
 */
export function validateMeasuredDraft(
  raw: string,
  decimalPlaces?: number | null,
): MeasuredDraftValidation {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, kind: "empty" };

  if (isMeasuredValueNumericShape(trimmed)) {
    const precision = validateMeasuredValuePrecision(trimmed, decimalPlaces);
    if (!precision.ok) return precision;
    return {
      ok: true,
      kind: "numeric",
      payload: { measuredValue: trimmed, measuredText: null },
    };
  }

  if (trimmed.length > MEASURED_TEXT_MAX_LENGTH) {
    return { ok: false, reason: "symbol_too_long", maxLength: MEASURED_TEXT_MAX_LENGTH };
  }

  return {
    ok: true,
    kind: "symbol",
    payload: { measuredValue: null, measuredText: trimmed },
  };
}

/** Payload for create/update when the draft is a saveable numeric or symbol reading. */
export function measuredReadingPayload(
  validation: MeasuredDraftValidation,
): MeasuredReadingPayload | null {
  if (!validation.ok) return null;
  if (validation.kind === "empty") return null;
  return validation.payload;
}

// ── Replicate slots (UI only — not a required count) ─────────────────────────

/**
 * How many replicate columns/rows to show. Starts at one empty slot (the
 * minimum useful input) and grows with saved readings plus "+ Tambah ulangan".
 * This is presentation only — it is NOT a business rule that N readings
 * must be filled. No catalog expected-count exists; do not hard-code 5 or 3.
 */
export function visibleReplicateCount(maxExistingIndex: number, extraSlots: number): number {
  return Math.max(1, maxExistingIndex) + Math.max(0, extraSlots);
}

/**
 * Whether the "+ Tambah ulangan" control should render at all (2026-09-20).
 * Catalog-level, not device/code-specific — driven purely by
 * `param.allowsRepeatedReadings` (default true, so every parameter without
 * explicit catalog configuration keeps today's behavior). Does not affect
 * `visibleReplicateCount`: a non-repeatable parameter with more than one
 * existing reading still shows every one of them — this only gates the
 * technician's ability to manually grow the slot count further.
 */
export function canAddReplicateSlot(
  editable: boolean,
  param: { allowsRepeatedReadings: boolean },
): boolean {
  return editable && param.allowsRepeatedReadings;
}

export interface ReplicateLabelOptions {
  /**
   * Catalog `allowsRepeatedReadings`. Omitted or true → numbered slots
   * ("Pembacaan 1"). False with a single visible slot → "Pembacaan".
   */
  allowsRepeatedReadings?: boolean;
  /**
   * How many slots are on screen. A single-reading parameter that already has
   * more than one stored reading still numbers them so each row stays distinct.
   */
  visibleCount?: number;
}

/**
 * Anonymous repetition label for Pattern A, and nested reps under a named point.
 * Presentation only — does not change replicateIndex or persistence.
 */
export function replicateLabel(replicateIndex: number, options?: ReplicateLabelOptions): string {
  const allowsRepeated = options?.allowsRepeatedReadings !== false;
  const singleReading =
    !allowsRepeated && (options?.visibleCount == null || options.visibleCount <= 1);
  if (singleReading) return "Pembacaan";
  return `Pembacaan ${replicateIndex}`;
}

export function patternASlotLabels(
  maxExistingIndex: number,
  extraSlots: number,
  options?: Pick<ReplicateLabelOptions, "allowsRepeatedReadings">,
): string[] {
  const count = visibleReplicateCount(maxExistingIndex, extraSlots);
  return Array.from({ length: count }, (_, i) =>
    replicateLabel(i + 1, {
      allowsRepeatedReadings: options?.allowsRepeatedReadings,
      visibleCount: count,
    }),
  );
}

export function sortNamedMeasurementPoints<T extends { sequence: number }>(points: readonly T[]): T[] {
  return [...points].sort((a, b) => a.sequence - b.sequence);
}

export interface NamedPointSlotView {
  replicateIndex: number;
  /** settingLabel when this point has a single visible slot; otherwise "Pembacaan N". */
  slotLabel: string;
}

export interface NamedPointGroupView {
  testPointId: string;
  settingLabel: string;
  settingValue: string | null;
  sequence: number;
  showGroupHeader: boolean;
  slots: NamedPointSlotView[];
}

/**
 * Pattern B presentation: named-point identity is `settingLabel` from the job
 * payload. Nested "Pembacaan N" appears only when that point has more than one
 * visible repetition slot. Labels are never inferred from replicateIndex.
 */
export function namedPointGroupView(args: {
  testPoint: {
    id: string;
    sequence: number;
    settingLabel: string;
    settingValue: string | null;
  };
  maxExistingReplicateIndex: number;
  extraSlots: number;
}): NamedPointGroupView {
  const count = visibleReplicateCount(args.maxExistingReplicateIndex, args.extraSlots);
  const nested = count > 1;
  return {
    testPointId: args.testPoint.id,
    settingLabel: args.testPoint.settingLabel,
    settingValue: args.testPoint.settingValue,
    sequence: args.testPoint.sequence,
    showGroupHeader: nested,
    slots: Array.from({ length: count }, (_, i) => ({
      replicateIndex: i + 1,
      slotLabel: nested ? replicateLabel(i + 1) : args.testPoint.settingLabel,
    })),
  };
}

/**
 * Historical Pattern A rows (`calibrationTestPointId` null) must not receive an
 * invented named-point label. Unknown ids also yield null — never a fallback
 * "Pembacaan" or hardcoded Awal/Akhir.
 */
export function namedLabelForResult(
  calibrationTestPointId: string | null,
  points: readonly { id: string; settingLabel: string }[],
): string | null {
  if (calibrationTestPointId == null) return null;
  return points.find((p) => p.id === calibrationTestPointId)?.settingLabel ?? null;
}

export type MeasurementEntryKindUi = "DIRECT" | "GRID";

export interface MeasurementEntryTarget {
  kind: MeasurementEntryKindUi;
  param: TechMeasurementParameter;
}

function namedTestPointsOf(
  param: TechMeasurementParameter | undefined,
): TechMeasurementTestPoint[] {
  return param?.testPoints?.length ? [...param.testPoints] : [];
}

/**
 * Collect every copy of this parameter from the measurement-parameters payload.
 * Named points may live on `gridParameters`, `capabilityGroups`, or (defensively)
 * `parameters[]` — Pattern B is `testPoints.length > 0` on any of them, not
 * `kind === "GRID"` alone and not result `replicateIndex`.
 */
export function parameterViewsFromMeasurementPayload(
  data: TechMeasurementParametersResponse,
  parameterId: string,
): TechMeasurementParameter[] {
  const views: TechMeasurementParameter[] = [];
  for (const param of data.gridParameters ?? []) {
    if (param.id === parameterId) views.push(param);
  }
  if (hasCapabilityGroups(data.capabilityGroups)) {
    for (const group of data.capabilityGroups) {
      for (const param of group.parameters) {
        if (param.id === parameterId) views.push(param);
      }
    }
  }
  for (const param of data.parameters ?? []) {
    if (param.id === parameterId) views.push(param);
  }
  return views;
}

/**
 * Pattern B iff the job payload has one or more named measurement points for
 * this parameter (snapshot count > 0). Zero points → Pattern A, including
 * historical jobs whose readings have null calibrationTestPointId.
 *
 * Prefers the first view that actually carries `testPoints`, regardless of
 * which array it came from. Does not invent labels from replicateIndex.
 */
export function resolveMeasurementEntryTarget(
  data: TechMeasurementParametersResponse | null | undefined,
  parameterId: string,
): MeasurementEntryTarget | null {
  if (!data) return null;

  const views = parameterViewsFromMeasurementPayload(data, parameterId);
  const withNamedPoints = views.find((param) => namedTestPointsOf(param).length > 0);
  if (withNamedPoints) {
    return {
      kind: "GRID",
      param: {
        ...withNamedPoints,
        testPoints: sortNamedMeasurementPoints(namedTestPointsOf(withNamedPoints)),
      },
    };
  }
  const fallback = views[0];
  return fallback ? { kind: "DIRECT", param: fallback } : null;
}

export interface PatternBResultRef {
  calibrationTestPointId: string | null;
  replicateIndex: number;
  measuredValue: string | null;
  measuredText?: string | null;
}

export interface PatternBEntrySlotView extends NamedPointSlotView {
  measuredValue: string | null;
}

export interface PatternBEntryGroupView extends NamedPointGroupView {
  slots: PatternBEntrySlotView[];
}

/**
 * Pattern B grouping: named point identity is `calibrationTestPointId` +
 * `sequence`/`settingLabel` from the job payload. `replicateIndex` is only the
 * repetition inside that point. NULL TP ids are ignored (historical Pattern A).
 */
export function patternBEntryPresentation(
  testPoints: readonly TechMeasurementTestPoint[],
  results: readonly PatternBResultRef[],
  extraByPoint: Readonly<Record<string, number>> = {},
): PatternBEntryGroupView[] {
  return sortNamedMeasurementPoints(testPoints).map((tp) => {
    const pointResults = results.filter((row) => row.calibrationTestPointId === tp.id);
    const maxExisting = pointResults.reduce((max, row) => Math.max(max, row.replicateIndex), 0);
    const view = namedPointGroupView({
      testPoint: tp,
      maxExistingReplicateIndex: maxExisting,
      extraSlots: extraByPoint[tp.id] ?? 0,
    });
    return {
      ...view,
      slots: view.slots.map((slot) => {
        const hit = pointResults.find((row) => row.replicateIndex === slot.replicateIndex);
        return { ...slot, measuredValue: hit?.measuredValue ?? null };
      }),
    };
  });
}

const DIRECTION_PARAMETER_CODES = new Set(["SPHYG_PRESSURE_ACC"]);

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

/**
 * Section visibility is separate from editability. REWORK keeps Hasil Pengukuran
 * visible (locked) even when the new attempt has zero rows.
 */
export function shouldShowMeasurementSection(
  job: { status: CalibrationJobStatus },
  hasRecordCapability: boolean,
  hasCurrentAttemptRows: boolean,
): boolean {
  return (
    hasRecordCapability &&
    (job.status === "IN_PROGRESS" || job.status === "REWORK" || hasCurrentAttemptRows)
  );
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

/**
 * `inputMode`/`step` for the numeric entry field given the parameter precision.
 * Null `decimalPlaces` → no precision restriction (`any`). Not the enforcement
 * mechanism — see `validateMeasuredValue`.
 */
export function measuredValueInputStep(decimalPlaces: number | null | undefined): string {
  if (decimalPlaces == null) return "any";
  const dp = Math.max(0, decimalPlaces);
  return dp === 0 ? "1" : `0.${"0".repeat(dp - 1)}1`;
}

/**
 * Validate a measured-value draft: numeric shape, then max fractional digits
 * when `decimalPlaces` is not null. Null `decimalPlaces` = no precision cap.
 */
export function validateMeasuredValue(
  raw: string,
  decimalPlaces?: number | null,
): MeasuredValuePrecisionResult {
  return validateMeasuredValuePrecision(raw, decimalPlaces);
}

/**
 * True when the string is a plain decimal the API accepts and (when set)
 * respects `decimalPlaces` as a maximum fractional length.
 */
export function isValidMeasuredValue(
  raw: string,
  decimalPlaces?: number | null,
): boolean {
  return validateMeasuredValue(raw, decimalPlaces).ok;
}

/**
 * Human-readable acceptance limit for a parameter. Prefers the verbatim LK
 * wording (`toleranceNote`); falls back to the resolved bounds.
 */
export function toleranceText(param: {
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceMinInclusive?: boolean;
  toleranceMaxInclusive?: boolean;
  toleranceNote: string | null;
  uom: { symbol: string } | null;
}): string {
  const note = param.toleranceNote?.trim();
  if (note) return note;
  const unit = param.uom?.symbol ? ` ${param.uom.symbol}` : "";
  const { toleranceMin: min, toleranceMax: max } = param;
  const minOp = param.toleranceMinInclusive === false ? ">" : "≥";
  const maxOp = param.toleranceMaxInclusive === false ? "<" : "≤";
  if (min !== null && max !== null) {
    if (param.toleranceMinInclusive === false || param.toleranceMaxInclusive === false) {
      return `${minOp} ${min}${unit} – ${maxOp} ${max}${unit}`;
    }
    return `${min}${unit} – ${max}${unit}`;
  }
  if (min !== null) return `${minOp} ${min}${unit}`;
  if (max !== null) return `${maxOp} ${max}${unit}`;
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
 * Pattern A (no test points): extra replicates are optional. The parameter has
 * data once at least one reading is filled. `total` is 1 when empty so the
 * chip can show 0/1 — not a rule that five (or any N) trials are required.
 */
export function parameterEntryStatus(
  rows: Pick<
    TechMeasurementResult,
    "replicateIndex" | "measuredValue" | "measuredText" | "isWithinTolerance"
  >[],
): ParameterEntryStatus {
  const withValue = rows.filter(isReadingFilled);
  return {
    filled: withValue.length,
    total: withValue.length > 0 ? withValue.length : 1,
    complete: withValue.length > 0,
    anyFail: withValue.some((r) => r.isWithinTolerance === false),
  };
}

/**
 * Pattern B / named measurement points: complete when every active test point
 * has at least one populated reading for the current attempt. Extra
 * replicates are optional. Labels are not inspected — only ids from the API.
 */
export function gridEntryStatus(
  rows: Pick<
    TechMeasurementResult,
    "calibrationTestPointId" | "measuredValue" | "measuredText" | "isWithinTolerance"
  >[],
  testPointIds: readonly string[],
): ParameterEntryStatus {
  const filledByPoint = new Set<string>();
  let anyFail = false;
  for (const row of rows) {
    if (!isReadingFilled(row)) continue;
    if (row.calibrationTestPointId) filledByPoint.add(row.calibrationTestPointId);
    if (row.isWithinTolerance === false) anyFail = true;
  }
  const total = testPointIds.length;
  const filled = testPointIds.filter((id) => filledByPoint.has(id)).length;
  return {
    filled,
    total,
    complete: total > 0 && filled >= total,
    anyFail,
  };
}

/** Read-only cell: format numeric precision, else show symbol text, else em dash. */
export function formatReadingDisplay(
  row: Pick<TechMeasurementResult, "measuredValue" | "measuredText"> | null | undefined,
  decimalPlaces: number | null | undefined,
): string {
  if (!row) return "—";
  if (row.measuredValue !== null && row.measuredValue !== "") {
    return formatMeasuredValue(row.measuredValue, decimalPlaces);
  }
  const text = row.measuredText?.trim();
  if (text) return text;
  return "—";
}
