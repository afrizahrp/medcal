import { describe, expect, it } from "vitest";
import {
  moveUnits,
  recommendDistribution,
  validateDistribution,
  workloadSummary,
  type WorkloadUnit,
} from "./workload-distribution";

function unitsOf(qty: number, id = "item"): WorkloadUnit[] {
  return [{ id, deviceKey: id, deviceLabel: id, qty }];
}

function totals(units: WorkloadUnit[], members: string[]) {
  const dist = recommendDistribution(units, members);
  return members
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((member) => workloadSummary(dist, units, members).find((row) => row.memberId === member)!.total);
}

describe("recommendDistribution", () => {
  it("is deterministic", () => {
    const units = unitsOf(25, "a").concat([{ id: "b", deviceKey: "b", deviceLabel: "b", qty: 7 }]);
    const members = ["d", "a", "c"];
    expect(recommendDistribution(units, members)).toEqual(recommendDistribution(units, [...members].reverse()));
  });

  it("assigns one job to one member and leaves the others at zero", () => {
    const dist = recommendDistribution(unitsOf(1), ["b", "a"]);
    expect(dist.a.item).toBe(1);
    expect(dist.b.item).toBe(0);
    expect(validateDistribution(dist, unitsOf(1), ["b", "a"])).toBeNull();
  });

  it("splits even and odd totals across members", () => {
    expect(totals(unitsOf(2), ["a", "b"])).toEqual([1, 1]);
    expect(totals(unitsOf(10), ["a", "b"])).toEqual([5, 5]);
    expect(totals(unitsOf(11), ["a", "b"])).toEqual([6, 5]);
    expect(totals(unitsOf(11), ["a", "b", "c"])).toEqual([4, 4, 3]);
    expect(totals(unitsOf(25), ["a", "b", "c", "d"])).toEqual([7, 6, 6, 6]);
    expect(totals(unitsOf(100), ["a", "b", "c", "d"])).toEqual([25, 25, 25, 25]);
  });

  it("balances 406 units across 4 members and splits large device groups", () => {
    const units: WorkloadUnit[] = [
      { id: "syringe", deviceKey: "syringe", deviceLabel: "Syringe Pump", qty: 94 },
      { id: "infusion", deviceKey: "infusion", deviceLabel: "Infusion Pump", qty: 42 },
      ...Array.from({ length: 54 }, (_, index) => ({
        id: `other-${index}`,
        deviceKey: `other-${index}`,
        deviceLabel: `Type ${index}`,
        qty: 5,
      })),
    ];
    const members = ["andi", "budi", "citra", "dedi"];
    const dist = recommendDistribution(units, members);
    expect(dist).toEqual(recommendDistribution(units, [...members].reverse()));
    expect(validateDistribution(dist, units, members)).toBeNull();

    const summary = workloadSummary(dist, units, members);
    const loads = summary.map((row) => row.total).sort((a, b) => a - b);
    expect(loads.reduce((sum, qty) => sum + qty, 0)).toBe(406);
    expect(loads[loads.length - 1]! - loads[0]!).toBeLessThanOrEqual(1);
    expect(loads).toEqual([101, 101, 102, 102]);

    const syringe = summary.map((row) => row.devices.find((device) => device.deviceKey === "syringe")?.qty ?? 0);
    expect(syringe.reduce((sum, qty) => sum + qty, 0)).toBe(94);
    expect(Math.max(...syringe) - Math.min(...syringe)).toBeLessThanOrEqual(1);

    const infusion = summary.map(
      (row) => row.devices.find((device) => device.deviceKey === "infusion")?.qty ?? 0,
    );
    expect(infusion.reduce((sum, qty) => sum + qty, 0)).toBe(42);
  });

  it("rejects an empty team and a double-assigned unit", () => {
    const units = unitsOf(2);
    expect(validateDistribution({}, units, [])).toMatch(/minimal satu/);
    const dist = recommendDistribution(units, ["a"]);
    dist.a.item = 3;
    expect(validateDistribution(dist, units, ["a"])).toMatch(/lebih dari satu kali/);
    dist.a.item = 1;
    expect(validateDistribution(dist, units, ["a"])).toMatch(/belum dibagikan/);
  });
});

describe("moveUnits", () => {
  it("moves a slice from one member to another without losing units", () => {
    const units = unitsOf(11);
    const dist = recommendDistribution(units, ["andi", "citra"]);
    const moved = moveUnits(dist, units, "andi", "citra", 1);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(validateDistribution(moved.distribution, units, ["andi", "citra"])).toBeNull();
    expect(moved.distribution.andi.item).toBe(5);
    expect(moved.distribution.citra.item).toBe(6);
  });

  it("refuses to move more than the member holds of a device", () => {
    const units: WorkloadUnit[] = [
      { id: "syringe", deviceKey: "syringe", deviceLabel: "Syringe Pump", qty: 4 },
      { id: "other", deviceKey: "other", deviceLabel: "Other", qty: 4 },
    ];
    const dist = recommendDistribution(units, ["a", "b"]);
    const moved = moveUnits(dist, units, "a", "b", 3, "syringe");
    expect(moved.ok).toBe(false);
    expect(dist.a.syringe).toBe(recommendDistribution(units, ["a", "b"]).a.syringe);
  });
});
