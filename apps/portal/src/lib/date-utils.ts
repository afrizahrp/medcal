import { format } from "date-fns";

/**
 * Portal date contract (locked):
 *   - user-facing display  → `dd/MM/yyyy`
 *   - form state + payload → `YYYY-MM-DD` string (never a `Date` object)
 *   - database             → `@db.Date`
 *
 * These helpers are the single source of truth for parsing, formatting, masking
 * and validating date-only values. `new Date("YYYY-MM-DD")` is deliberately never
 * used here — it parses as UTC midnight and shifts the calendar day in non-UTC
 * zones. Local construction (`new Date(y, m - 1, d)`) is used instead.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DISPLAY_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Gregorian leap-year rule. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in a 1-indexed `month` of `year` (0 for an out-of-range month). */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

/**
 * True only when `year`/`month`/`day` form a real calendar date — rejects
 * 31/04, 31/06, 31/09, 31/11 (30-day months), 31/02 and 29/02 in a non-leap year.
 */
export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  return day <= daysInMonth(year, month);
}

/**
 * Parse a `yyyy-mm-dd[...]` API/date-only string as a local calendar day.
 * Returns `undefined` for empty, malformed, or calendar-invalid input.
 */
export function parseDateOnly(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const slice = value.slice(0, 10);
  if (!ISO_DATE_RE.test(slice)) return undefined;
  const [y, m, d] = slice.split("-").map(Number);
  if (!isRealCalendarDate(y, m, d)) return undefined;
  return new Date(y, m - 1, d);
}

/** First 10 chars of an API ISO/date string → `YYYY-MM-DD` form state (`""` when absent). */
export function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Presentation — `dd/MM/yyyy`, or `fallback` (default em dash) when empty/invalid. */
export function fmtDateOnly(value: string | null | undefined, fallback = "—"): string {
  const dt = parseDateOnly(value);
  return dt ? format(dt, "dd/MM/yyyy") : fallback;
}

/** Local calendar `Date` → `yyyy-MM-dd` for form state / API payload. */
export function toDateOnlyString(date: Date | undefined | null): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

/**
 * Instant timestamps (e.g. `acceptedAt`, `issuedAt`) → local calendar day as
 * `dd/MM/yyyy`. Not for date-only `@db.Date` fields — use {@link fmtDateOnly}.
 */
export function fmtTimestampDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return format(dt, "dd/MM/yyyy");
}

/** Today as a `YYYY-MM-DD` string in the local calendar. */
export function todayDateOnly(): string {
  return format(new Date(), "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Keyboard date field — mask + display <-> wire conversion
// ---------------------------------------------------------------------------

/**
 * Regroup free-typed input as `dd/mm/yyyy`: strip non-digits, cap at 8 digits,
 * and re-insert the `/` separators. With `trailingSlash` (the default) a `/` is
 * appended the moment the day or month reaches 2 digits, so typing flows
 * `31` → `31/` → `31/03` → `31/03/` → `31/03/2026`. The field passes
 * `trailingSlash: false` while the user is deleting so backspace is not trapped.
 */
export function maskDateInput(raw: string, opts: { trailingSlash?: boolean } = {}): string {
  const trailingSlash = opts.trailingSlash ?? true;
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2 || (trailingSlash && digits.length === 2)) out += "/";
  out += digits.slice(2, 4);
  if (digits.length > 4 || (trailingSlash && digits.length === 4)) out += "/";
  out += digits.slice(4, 8);
  return out;
}

/**
 * `dd/mm/yyyy` → `yyyy-mm-dd`. Returns `null` when the value is incomplete or is
 * not a real calendar date (real month/day lengths and leap years enforced).
 */
export function displayToIso(display: string): string | null {
  const m = DISPLAY_DATE_RE.exec(display.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  if (!isRealCalendarDate(Number(yyyy), Number(mm), Number(dd))) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** `yyyy-mm-dd` → `dd/mm/yyyy` for display (`""` when empty/invalid). */
export function isoToDisplay(iso: string | null | undefined): string {
  const dt = parseDateOnly(iso);
  return dt ? format(dt, "dd/MM/yyyy") : "";
}

/**
 * Validate a typed display value. Returns an error message, or `null` when OK.
 * An empty value is OK unless `required`.
 */
export function validateDisplayDate(
  display: string,
  opts: { required?: boolean } = {},
): string | null {
  const trimmed = display.trim();
  if (!trimmed) return opts.required ? "Tanggal wajib diisi" : null;
  if (!DISPLAY_DATE_RE.test(trimmed)) return "Format tanggal harus dd/mm/yyyy";
  if (!displayToIso(trimmed)) return "Tanggal tidak valid";
  return null;
}

/**
 * Mirrors backend validity window: start = validFrom || calibrationDate, must be
 * on or before validUntil. Empty required fields → not ok. Lexicographic compare
 * is safe for `YYYY-MM-DD`.
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
