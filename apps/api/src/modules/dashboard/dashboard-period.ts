/**
 * Period boundaries for Management Dashboard V1.
 * Asia/Jakarta is UTC+7 with no DST, so civil dates are a fixed offset.
 * Period end for presets is exclusive `now`. Custom ranges are inclusive
 * calendar dates in Asia/Jakarta: [start of `from`, start of the day after `to`).
 */

export const DASHBOARD_TIMEZONE = "Asia/Jakarta" as const;

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DashboardPeriodPreset = "today" | "week" | "month" | "quarter" | "year" | "custom";
export type DashboardBucketGrain = "hour" | "day" | "week" | "month";

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export interface DashboardBucket {
  start: Date;
  end: Date;
  label: string;
}

export interface ResolvedDashboardPeriod {
  preset: DashboardPeriodPreset;
  start: Date;
  end: Date;
  from: string;
  to: string;
  timezone: typeof DASHBOARD_TIMEZONE;
  grain: DashboardBucketGrain;
  buckets: DashboardBucket[];
}

export class DashboardPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardPeriodError";
  }
}

export function jakartaCivil(date: Date): CivilDate & { hour: number; minute: number; second: number } {
  const shifted = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function utcFromJakarta(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - JAKARTA_OFFSET_MS);
}

export function formatCivilDate(date: CivilDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

export function parseCivilDate(value: string): CivilDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new DashboardPeriodError("Date must be YYYY-MM-DD");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const civil = jakartaCivil(utcFromJakarta(year, month, day));
  if (civil.year !== year || civil.month !== month || civil.day !== day) {
    throw new DashboardPeriodError("Date is not a real calendar day");
  }
  return { year, month, day };
}

export function resolveDashboardPeriod(input: {
  period?: DashboardPeriodPreset;
  from?: string;
  to?: string;
  now?: Date;
}): ResolvedDashboardPeriod {
  const now = input.now ?? new Date();
  const preset = input.period ?? (input.from || input.to ? "custom" : "month");

  let start: Date;
  let end: Date;

  if (preset === "custom") {
    if (!input.from || !input.to) {
      throw new DashboardPeriodError("Custom period requires from and to");
    }
    const from = parseCivilDate(input.from);
    const to = parseCivilDate(input.to);
    start = utcFromJakarta(from.year, from.month, from.day);
    const toStart = utcFromJakarta(to.year, to.month, to.day);
    if (toStart.getTime() < start.getTime()) {
      throw new DashboardPeriodError("Custom period from must be on or before to");
    }
    end = new Date(toStart.getTime() + DAY_MS);
  } else {
    const today = jakartaCivil(now);
    const todayStart = utcFromJakarta(today.year, today.month, today.day);
    if (preset === "today") {
      start = todayStart;
    } else if (preset === "week") {
      const monday = addDays(today, -weekdayMonday0(today));
      start = utcFromJakarta(monday.year, monday.month, monday.day);
    } else if (preset === "month") {
      start = utcFromJakarta(today.year, today.month, 1);
    } else if (preset === "quarter") {
      const quarterMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
      start = utcFromJakarta(today.year, quarterMonth, 1);
    } else if (preset === "year") {
      start = utcFromJakarta(today.year, 1, 1);
    } else {
      throw new DashboardPeriodError("Unknown period");
    }
    end = now;
    if (end.getTime() < start.getTime()) {
      end = start;
    }
  }

  const grain = grainFor(preset, start, end);
  const buckets = buildBuckets(start, end, grain);
  const fromCivil = jakartaCivil(start);
  const toCivil = jakartaCivil(new Date(end.getTime() - 1));

  return {
    preset,
    start,
    end,
    from: formatCivilDate(fromCivil),
    to: formatCivilDate(toCivil),
    timezone: DASHBOARD_TIMEZONE,
    grain,
    buckets,
  };
}

export function countByBucket(timestamps: readonly Date[], buckets: readonly DashboardBucket[]): number[] {
  const counts = buckets.map(() => 0);
  for (const timestamp of timestamps) {
    const time = timestamp.getTime();
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const bucket = buckets[mid]!;
      if (time < bucket.start.getTime()) {
        hi = mid - 1;
      } else if (time >= bucket.end.getTime()) {
        lo = mid + 1;
      } else {
        counts[mid] = (counts[mid] ?? 0) + 1;
        break;
      }
    }
  }
  return counts;
}

function grainFor(preset: DashboardPeriodPreset, start: Date, end: Date): DashboardBucketGrain {
  if (preset === "today") return "hour";
  if (preset === "week" || preset === "month") return "day";
  if (preset === "quarter") return "week";
  if (preset === "year") return "month";
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  if (days <= 1) return "hour";
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function buildBuckets(start: Date, end: Date, grain: DashboardBucketGrain): DashboardBucket[] {
  if (end.getTime() <= start.getTime()) return [];
  const buckets: DashboardBucket[] = [];
  let cursor = alignBucketStart(start, grain);
  while (cursor.getTime() < end.getTime()) {
    const next = stepBucket(cursor, grain);
    const bucketStart = new Date(Math.max(cursor.getTime(), start.getTime()));
    const bucketEnd = new Date(Math.min(next.getTime(), end.getTime()));
    if (bucketEnd.getTime() > bucketStart.getTime()) {
      buckets.push({
        start: bucketStart,
        end: bucketEnd,
        label: bucketLabel(cursor, grain),
      });
    }
    cursor = next;
  }
  return buckets;
}

function alignBucketStart(instant: Date, grain: DashboardBucketGrain): Date {
  const civil = jakartaCivil(instant);
  if (grain === "hour") return utcFromJakarta(civil.year, civil.month, civil.day, civil.hour);
  if (grain === "day") return utcFromJakarta(civil.year, civil.month, civil.day);
  if (grain === "week") {
    const monday = addDays(civil, -weekdayMonday0(civil));
    return utcFromJakarta(monday.year, monday.month, monday.day);
  }
  return utcFromJakarta(civil.year, civil.month, 1);
}

function stepBucket(cursor: Date, grain: DashboardBucketGrain): Date {
  if (grain === "hour") return new Date(cursor.getTime() + HOUR_MS);
  if (grain === "day") return new Date(cursor.getTime() + DAY_MS);
  if (grain === "week") return new Date(cursor.getTime() + 7 * DAY_MS);
  const civil = jakartaCivil(cursor);
  const nextMonth = civil.month === 12 ? { year: civil.year + 1, month: 1 } : { year: civil.year, month: civil.month + 1 };
  return utcFromJakarta(nextMonth.year, nextMonth.month, 1);
}

function bucketLabel(cursor: Date, grain: DashboardBucketGrain): string {
  const civil = jakartaCivil(cursor);
  if (grain === "hour") return `${pad2(civil.hour)}:00`;
  if (grain === "day") return `${civil.day} ${MONTHS[civil.month - 1]}`;
  if (grain === "month") return `${MONTHS[civil.month - 1]} ${civil.year}`;
  const sunday = addDays(civil, 6);
  return `${civil.day} ${MONTHS[civil.month - 1]}–${sunday.day} ${MONTHS[sunday.month - 1]}`;
}

function weekdayMonday0(date: CivilDate): number {
  const shifted = new Date(utcFromJakarta(date.year, date.month, date.day).getTime() + JAKARTA_OFFSET_MS);
  return (shifted.getUTCDay() + 6) % 7;
}

function addDays(date: CivilDate, delta: number): CivilDate {
  const next = new Date(utcFromJakarta(date.year, date.month, date.day).getTime() + delta * DAY_MS);
  const civil = jakartaCivil(next);
  return { year: civil.year, month: civil.month, day: civil.day };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
