import { format } from "date-fns";

/**
 * Parse a `yyyy-mm-dd[...]` API/date-only string as a local calendar day.
 * Avoids `new Date("YYYY-MM-DD")` UTC-midnight ambiguity.
 */
export function parseDateOnly(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Wire/form value: first 10 chars of an API ISO/date string → `YYYY-MM-DD`. */
export function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Presentation only — `dd/MM/yyyy`. Wire/DB stays date-only ISO. */
export function fmtDateOnly(value: string | null | undefined): string {
  const dt = parseDateOnly(value);
  return dt ? format(dt, "dd/MM/yyyy") : "—";
}

/** Calendar `Date` → `yyyy-MM-dd` for form state / API payload. */
export function toDateOnlyString(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

/**
 * Instant timestamps (e.g. acceptedAt) → local calendar day as `dd/MM/yyyy`.
 * Not for date-only `@db.Date` fields.
 */
export function fmtTimestampDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return format(dt, "dd/MM/yyyy");
}

/**
 * Mirrors backend validity window: start = validFrom || calibrationDate,
 * must be on or before validUntil. Empty required fields → not ok.
 * Lexicographic compare is safe for `YYYY-MM-DD`.
 */
export function isCalibrationValidityWindowOk(
  calibrationDate: string,
  validFrom: string,
  validUntil: string,
): boolean {
  if (!calibrationDate || !validUntil) return false;
  const start = validFrom || calibrationDate;
  return start <= validUntil;
}
