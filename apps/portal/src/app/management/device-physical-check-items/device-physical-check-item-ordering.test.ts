import { describe, expect, it } from "vitest";
import { reorderIds, sameOrder } from "./device-physical-check-item-ordering";

describe("reorderIds", () => {
  it("moves an item down", () => {
    expect(reorderIds(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(reorderIds(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
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

  it("keeps API order when used for Physical Inspection within one DeviceType", () => {
    const apiOrder = ["item-1", "item-2", "item-3", "item-4", "item-5"];
    const afterDrag = reorderIds(apiOrder, "item-5", "item-1");
    expect(afterDrag).toEqual(["item-5", "item-1", "item-2", "item-3", "item-4"]);
    expect(sameOrder(apiOrder, afterDrag)).toBe(false);
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
