/**
 * Text-based MeasurementResult precision helpers.
 *
 * `DeviceCalibrationParameter.decimalPlaces` is the MAXIMUM number of digits
 * after the decimal separator. Null means no restriction. Never round or
 * rewrite the submitted value — only accept or reject.
 */

const MEASURED_VALUE_SHAPE = /^-?\d+(\.\d+)?$/;

/** True when `raw` is a plain decimal the MeasurementResult wire schema accepts. */
export function isMeasuredValueNumericShape(raw: string): boolean {
  return MEASURED_VALUE_SHAPE.test(raw.trim());
}

/**
 * Count of digits after `.` in a numeric string.
 * `"23"` → 0, `"23.0"` → 1, `"23.20"` → 2.
 * Returns `null` when the string is not a plain decimal shape.
 */
export function fractionalDigitCount(raw: string): number | null {
  const trimmed = raw.trim();
  const match = /^-?\d+(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return null;
  return match[1]?.length ?? 0;
}

/**
 * True when `raw` respects `decimalPlaces` as a maximum fractional length.
 * `decimalPlaces === null` / `undefined` → no decimal-place restriction
 * (shape is not checked here — use `isMeasuredValueNumericShape` separately).
 */
export function respectsDecimalPlaces(
  raw: string,
  decimalPlaces: number | null | undefined,
): boolean {
  if (decimalPlaces == null) return true;
  const count = fractionalDigitCount(raw);
  if (count === null) return false;
  return count <= decimalPlaces;
}

export type MeasuredValuePrecisionFailure =
  | { ok: false; reason: "invalid_format" }
  | { ok: false; reason: "decimal_places_exceeded"; decimalPlaces: number };

export type MeasuredValuePrecisionResult = { ok: true } | MeasuredValuePrecisionFailure;

/**
 * Validate a measured-value string: numeric shape first, then max fractional
 * digits when `decimalPlaces` is set.
 */
export function validateMeasuredValuePrecision(
  raw: string,
  decimalPlaces: number | null | undefined,
): MeasuredValuePrecisionResult {
  if (!isMeasuredValueNumericShape(raw)) {
    return { ok: false, reason: "invalid_format" };
  }
  if (decimalPlaces != null && !respectsDecimalPlaces(raw, decimalPlaces)) {
    return { ok: false, reason: "decimal_places_exceeded", decimalPlaces };
  }
  return { ok: true };
}

/** Indonesian UI copy for an excess-decimals failure. */
export function measuredValueDecimalPlacesExceededMessage(decimalPlaces: number): string {
  if (decimalPlaces === 0) {
    return "Nilai harus bilangan bulat (tanpa angka di belakang koma).";
  }
  return `Maksimal ${decimalPlaces} angka di belakang koma.`;
}
