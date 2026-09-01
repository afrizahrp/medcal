import { describe, expect, it } from "vitest";
import { reorderEquipmentIds, sameEquipmentOrder } from "./work-order-equipment-ordering";

describe("reorderEquipmentIds", () => {
  it("moves an item to the top (Tachometer example)", () => {
    // Current: Luxmeter, Pressure Meter, Tachometer → drag Tachometer onto Luxmeter.
    const ids = ["luxmeter", "pressure", "tacho"];
    expect(reorderEquipmentIds(ids, "tacho", "luxmeter")).toEqual([
      "tacho",
      "luxmeter",
      "pressure",
    ]);
  });

  it("moves an item down", () => {
    expect(reorderEquipmentIds(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("returns the same reference when active === over", () => {
    const ids = ["a", "b", "c"];
    expect(reorderEquipmentIds(ids, "b", "b")).toBe(ids);
  });

  it("returns the same reference for unknown ids", () => {
    const ids = ["a", "b", "c"];
    expect(reorderEquipmentIds(ids, "x", "b")).toBe(ids);
  });

  it("preserves the full set (no additions or drops)", () => {
    const out = reorderEquipmentIds(["a", "b", "c", "d", "e"], "e", "a");
    expect([...out].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("sameEquipmentOrder", () => {
  it("detects identical order", () => {
    expect(sameEquipmentOrder(["a", "b"], ["a", "b"])).toBe(true);
  });
  it("detects a different order", () => {
    expect(sameEquipmentOrder(["a", "b"], ["b", "a"])).toBe(false);
  });
  it("detects a different length", () => {
    expect(sameEquipmentOrder(["a", "b"], ["a"])).toBe(false);
  });
});
