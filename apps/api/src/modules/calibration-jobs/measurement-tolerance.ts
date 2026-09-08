import { Prisma } from "@medcal/db";
import type { CalibrationValueType } from "@medcal/db";

/**
 * Tolerance-resolution engine for MeasurementResult.
 *
 * Implements the priority chain from MeasurementResult_Stage1_Design_Finalization
 * §8.1 and the worked examples in §4:
 *
 *   1. calibrationTestPoint.toleranceMin/Max set (per-point override) → use it.
 *   2. else parameter.toleranceMin/Max set (structured bounds)        → use it.
 *   3. else parse a `± delta` / `± N%` / `Min…Max` pattern out of the
 *      toleranceNote (test-point note first, then parameter note) and combine
 *      it with the applied nominal value → compute effectiveToleranceMin/Max.
 *   4. else → effectiveToleranceMin/Max stay NULL (isWithinTolerance stays NULL).
 *
 * The resolved bounds + appliedNominalValue are snapshotted onto the row at
 * write time; they are NEVER recomputed from the (possibly since-edited) master
 * catalog. This module is pure — no DB, no NestJS — so it is unit-tested in
 * isolation (measurement-tolerance.test.ts).
 */

type DecimalInput = Prisma.Decimal | number | string | null | undefined;

function toDecimal(value: DecimalInput): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value;
  const d = new Prisma.Decimal(value);
  return d;
}

// ── Note parsing ────────────────────────────────────────────────────────────

/** A single numeric literal, tolerating the Indonesian decimal comma (`0,025`). */
const NUMBER = String.raw`[-+]?\d+(?:[.,]\d+)?`;

function parseNumber(raw: string): Prisma.Decimal {
  return new Prisma.Decimal(raw.replace(",", ".").replace(/^\+/, ""));
}

export type ParsedToleranceNote =
  /** `± 5 mmHg`, `± 3°C`, `Akurasi tekanan ± 4 mmHg …` — absolute delta around the nominal. */
  | { kind: "ABSOLUTE_DELTA"; delta: Prisma.Decimal }
  /** `± 10 %`, `±20%`, `± 3 % SPO2` — delta is a percentage of the nominal. */
  | { kind: "PERCENT_DELTA"; percent: Prisma.Decimal }
  /** `Min : 0,4; Max : 1` — explicit absolute bounds, no nominal needed. */
  | { kind: "EXPLICIT_BOUNDS"; min: Prisma.Decimal | null; max: Prisma.Decimal | null };

/**
 * Best-effort parse of a free-text tolerance note into a computable rule.
 * Returns `null` when the note carries no single unambiguous rule — including
 * the deliberately multi-class notes (`INCU_AIR_TEMP` has both `± 1.5 °C` and
 * `± 0.8 °C`; `SUCT_MAX_VACUUM` says "isi salah satu sesuai dengan UUT"), which
 * §5 routes through per-point CalibrationTestPoint overrides instead.
 *
 * Tested against every distinct note-only format currently in the live catalog
 * (see measurement-tolerance.test.ts): `± N unit`, `±N%`, `± N %`, notes with a
 * `± N` embedded mid-sentence, and the `Min : x; Max : y` form.
 */
export function parseToleranceNote(note: string | null | undefined): ParsedToleranceNote | null {
  if (!note) return null;
  const text = note.trim();
  if (text.length === 0) return null;

  // "isi salah satu" / "atau sesuai" style notes are per-unit choices, not a rule.
  if (/salah satu sesuai dengan uut/i.test(text)) return null;

  // Collect every "± <number>[%]" occurrence. More than one *distinct* delta ⇒
  // the note describes multiple tolerance classes ⇒ not automatically resolvable.
  const pmMatches = [...text.matchAll(new RegExp(String.raw`±\s*(${NUMBER})\s*(%?)`, "g"))];
  if (pmMatches.length > 0) {
    const signatures = new Set(
      pmMatches.map((m) => `${parseNumber(m[1]!).toString()}${m[2] === "%" ? "%" : ""}`),
    );
    if (signatures.size > 1) return null;
    const [, numRaw, pct] = pmMatches[0]!;
    const value = parseNumber(numRaw!).abs();
    return pct === "%"
      ? { kind: "PERCENT_DELTA", percent: value }
      : { kind: "ABSOLUTE_DELTA", delta: value };
  }

  // Explicit "Min : x" / "Max : y" (either or both). Also matches "Min: x".
  const minMatch = text.match(new RegExp(String.raw`min\s*[:=]?\s*(${NUMBER})`, "i"));
  const maxMatch = text.match(new RegExp(String.raw`max\s*[:=]?\s*(${NUMBER})`, "i"));
  if (minMatch || maxMatch) {
    return {
      kind: "EXPLICIT_BOUNDS",
      min: minMatch ? parseNumber(minMatch[1]!) : null,
      max: maxMatch ? parseNumber(maxMatch[1]!) : null,
    };
  }

  // Leading inequality: "≥ 0.4", "> 250000", "≤ 160", "< 150".
  const gte = text.match(new RegExp(String.raw`^[≥>]=?\s*(${NUMBER})`));
  if (gte) return { kind: "EXPLICIT_BOUNDS", min: parseNumber(gte[1]!), max: null };
  const lte = text.match(new RegExp(String.raw`^[≤<]=?\s*(${NUMBER})`));
  if (lte) return { kind: "EXPLICIT_BOUNDS", min: null, max: parseNumber(lte[1]!) };

  return null;
}

// ── Effective-tolerance resolution ──────────────────────────────────────────

export interface ToleranceResolutionInput {
  valueType: CalibrationValueType;
  parameter: {
    toleranceMin: DecimalInput;
    toleranceMax: DecimalInput;
    toleranceNote: string | null;
  };
  /** The test point this reading belongs to, or `null` for Pattern A / note-only. */
  testPoint?: {
    settingValue: DecimalInput;
    toleranceMin: DecimalInput;
    toleranceMax: DecimalInput;
    toleranceNote: string | null;
  } | null;
  /**
   * Technician-supplied nominal for the Pattern D generic-slot case
   * (settingValue NULL). Ignored when the test point already carries a
   * settingValue. Optional everywhere else.
   */
  suppliedNominalValue?: DecimalInput;
}

export interface ResolvedTolerance {
  effectiveToleranceMin: Prisma.Decimal | null;
  effectiveToleranceMax: Prisma.Decimal | null;
  /** Snapshot of the nominal used to resolve a `± delta` note; `null` otherwise. */
  appliedNominalValue: Prisma.Decimal | null;
  /**
   * How the bounds were derived — for the write path's diagnostics and tests.
   * `NONE` ⇒ both bounds are NULL and isWithinTolerance will be NULL.
   */
  source: "TEST_POINT_OVERRIDE" | "PARAMETER_BOUNDS" | "NOTE" | "NONE";
}

function fromDelta(
  nominal: Prisma.Decimal,
  delta: Prisma.Decimal,
): { min: Prisma.Decimal; max: Prisma.Decimal } {
  return { min: nominal.minus(delta), max: nominal.plus(delta) };
}

export function resolveEffectiveTolerance(input: ToleranceResolutionInput): ResolvedTolerance {
  const tp = input.testPoint ?? null;

  // The nominal in effect for this reading: the test point's declared setpoint,
  // else the technician-supplied value (generic slot). Snapshotted regardless of
  // whether a note ends up needing it, so LOGGER_SUMMARY / Pattern-B rows keep a
  // faithful record of what was dialled in.
  const appliedNominalValue =
    toDecimal(tp?.settingValue) ?? toDecimal(input.suppliedNominalValue) ?? null;

  // 1. Per-point override — either bound present counts as an override.
  const tpMin = toDecimal(tp?.toleranceMin);
  const tpMax = toDecimal(tp?.toleranceMax);
  if (tpMin !== null || tpMax !== null) {
    return {
      effectiveToleranceMin: tpMin,
      effectiveToleranceMax: tpMax,
      appliedNominalValue,
      source: "TEST_POINT_OVERRIDE",
    };
  }

  // 2. Structured parameter bounds (Pattern A / C).
  const pMin = toDecimal(input.parameter.toleranceMin);
  const pMax = toDecimal(input.parameter.toleranceMax);
  if (pMin !== null || pMax !== null) {
    return {
      effectiveToleranceMin: pMin,
      effectiveToleranceMax: pMax,
      appliedNominalValue,
      source: "PARAMETER_BOUNDS",
    };
  }

  // 3. Note-only — test-point note first (an override), then the parameter note.
  const parsed = parseToleranceNote(tp?.toleranceNote) ?? parseToleranceNote(input.parameter.toleranceNote);
  if (parsed) {
    if (parsed.kind === "EXPLICIT_BOUNDS") {
      return {
        effectiveToleranceMin: parsed.min,
        effectiveToleranceMax: parsed.max,
        appliedNominalValue,
        source: "NOTE",
      };
    }
    // ABSOLUTE_DELTA / PERCENT_DELTA both need a nominal.
    if (appliedNominalValue !== null) {
      const delta =
        parsed.kind === "PERCENT_DELTA"
          ? appliedNominalValue.abs().times(parsed.percent).dividedBy(100)
          : parsed.delta;
      const { min, max } = fromDelta(appliedNominalValue, delta);
      return {
        effectiveToleranceMin: min,
        effectiveToleranceMax: max,
        appliedNominalValue,
        source: "NOTE",
      };
    }
  }

  // 4. Unresolvable.
  return {
    effectiveToleranceMin: null,
    effectiveToleranceMax: null,
    appliedNominalValue,
    source: "NONE",
  };
}

// ── isWithinTolerance ───────────────────────────────────────────────────────

export interface WithinToleranceInput {
  valueType: CalibrationValueType;
  measuredValue: DecimalInput;
  measuredBool: boolean | null | undefined;
  effectiveToleranceMin: DecimalInput;
  effectiveToleranceMax: DecimalInput;
}

/**
 * Compute isWithinTolerance from the RAW measured value (locked project rule).
 *
 * - BOOLEAN: mirrors measuredBool directly — never NULL for a recorded boolean
 *   reading (§4.4c). `true` = pass.
 * - NUMBER / RATIO: evaluate the numeric `measuredValue` against the effective
 *   bounds. Lower-bound-only and upper-bound-only are both supported. NULL when
 *   there is no measured value or no computable bound.
 * - TEXT: always NULL (no automatic evaluation).
 */
export function computeIsWithinTolerance(input: WithinToleranceInput): boolean | null {
  if (input.valueType === "BOOLEAN") {
    return input.measuredBool ?? null;
  }
  if (input.valueType === "TEXT") return null;

  const value = toDecimal(input.measuredValue);
  if (value === null) return null;

  const min = toDecimal(input.effectiveToleranceMin);
  const max = toDecimal(input.effectiveToleranceMax);
  if (min === null && max === null) return null;

  if (min !== null && value.lessThan(min)) return false;
  if (max !== null && value.greaterThan(max)) return false;
  return true;
}
