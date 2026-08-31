import { describe, expect, it } from "vitest";
import { reorderIds, sameOrder } from "./equipment-requirement-ordering";

describe("reorderIds", () => {
  it("moves an item down", () => {
    expect(reorderIds(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(reorderIds(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("reproduces the Dental Unit worksheet reorder", () => {
    // Digital Luxmeter (2) dropped below Digital Pressure Meter (3).
    const ids = ["tacho", "luxmeter", "pressure", "esa", "thermo"];
    expect(reorderIds(ids, "luxmeter", "pressure")).toEqual([
      "tacho",
      "pressure",
      "luxmeter",
      "esa",
      "thermo",
    ]);
  });

  it("returns the same reference when active === over", () => {
    const ids = ["a", "b", "c"];
    expect(reorderIds(ids, "b", "b")).toBe(ids);
  });

  it("returns the same reference for unknown ids", () => {
    const ids = ["a", "b", "c"];
    expect(reorderIds(ids, "x", "b")).toBe(ids);
  });

  it("preserves the full set (no additions or drops)", () => {
    const out = reorderIds(["a", "b", "c", "d", "e"], "e", "a");
    expect([...out].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("sameOrder", () => {
  it("detects identical order", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
  });
  it("detects a different order", () => {
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
  });
  it("detects a different length", () => {
    expect(sameOrder(["a", "b"], ["a"])).toBe(false);
  });
});
