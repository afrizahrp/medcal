import { describe, expect, it } from "vitest";
import { moveAdjacent } from "./calibration-test-point-ordering";

describe("moveAdjacent", () => {
  it("moves an item up by swapping with its predecessor", () => {
    expect(moveAdjacent(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("moves an item down by swapping with its successor", () => {
    expect(moveAdjacent(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("returns the same reference when moving the first item up", () => {
    const ids = ["a", "b", "c"];
    expect(moveAdjacent(ids, "a", "up")).toBe(ids);
  });

  it("returns the same reference when moving the last item down", () => {
    const ids = ["a", "b", "c"];
    expect(moveAdjacent(ids, "c", "down")).toBe(ids);
  });

  it("returns the same reference for an unknown id", () => {
    const ids = ["a", "b", "c"];
    expect(moveAdjacent(ids, "x", "up")).toBe(ids);
  });

  it("preserves the full set (no additions or drops)", () => {
    const out = moveAdjacent(["a", "b", "c", "d"], "c", "up");
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("handles a single-item list (no-op both directions)", () => {
    const ids = ["only"];
    expect(moveAdjacent(ids, "only", "up")).toBe(ids);
    expect(moveAdjacent(ids, "only", "down")).toBe(ids);
  });

  it("does not mutate the input array", () => {
    const ids = ["a", "b", "c"];
    moveAdjacent(ids, "b", "up");
    expect(ids).toEqual(["a", "b", "c"]);
  });
});
