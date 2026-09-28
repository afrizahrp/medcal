import { describe, expect, it } from "vitest";
import {
  countByBucket,
  jakartaCivil,
  resolveDashboardPeriod,
  utcFromJakarta,
  DashboardPeriodError,
} from "./dashboard-period";

describe("dashboard period (Asia/Jakarta)", () => {
  it("treats Jakarta midnight as the previous UTC evening", () => {
    const midnight = utcFromJakarta(2026, 9, 27);
    expect(midnight.toISOString()).toBe("2026-09-26T17:00:00.000Z");
    expect(jakartaCivil(midnight)).toMatchObject({ year: 2026, month: 9, day: 27, hour: 0 });
  });

  it("places 23:30 UTC on the next Jakarta morning", () => {
    const instant = new Date("2026-09-26T23:30:00.000Z");
    expect(jakartaCivil(instant)).toMatchObject({ year: 2026, month: 9, day: 27, hour: 6, minute: 30 });
  });

  it("uses daily buckets for the current month and stops at now", () => {
    const now = utcFromJakarta(2026, 9, 27, 10, 15);
    const period = resolveDashboardPeriod({ period: "month", now });
    expect(period.from).toBe("2026-09-01");
    expect(period.to).toBe("2026-09-27");
    expect(period.grain).toBe("day");
    expect(period.buckets).toHaveLength(27);
    expect(period.buckets[0]?.label).toBe("1 Sep");
    expect(period.buckets.at(-1)?.end.toISOString()).toBe(now.toISOString());
  });

  it("starts the week on Monday in Jakarta", () => {
    const now = utcFromJakarta(2026, 9, 27, 10);
    const period = resolveDashboardPeriod({ period: "week", now });
    expect(period.from).toBe("2026-09-21");
    expect(period.buckets).toHaveLength(7);
  });

  it("keeps a UTC-evening timestamp inside the Jakarta calendar day and excludes the next midnight", () => {
    const period = resolveDashboardPeriod({
      period: "custom",
      from: "2026-09-27",
      to: "2026-09-27",
    });
    expect(period.start.toISOString()).toBe("2026-09-26T17:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-09-27T17:00:00.000Z");

    const counts = countByBucket(
      [
        new Date("2026-09-26T23:30:00.000Z"),
        new Date("2026-09-26T16:30:00.000Z"),
        new Date("2026-09-27T17:00:00.000Z"),
      ],
      period.buckets,
    );
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
  });

  it("rejects an inverted custom range and an impossible calendar day", () => {
    expect(() =>
      resolveDashboardPeriod({ period: "custom", from: "2026-09-28", to: "2026-09-27" }),
    ).toThrow(DashboardPeriodError);
    expect(() =>
      resolveDashboardPeriod({ period: "custom", from: "2026-02-31", to: "2026-03-01" }),
    ).toThrow(DashboardPeriodError);
  });
});
