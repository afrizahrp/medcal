import { describe, expect, it } from "vitest";

import { groupByLogicalTest, orderByLogicalTest } from "./logical-test-grouping";

/**
 * Phase 4A (Gap A) — logical-test grouping is CATALOG/PRESENTATION only.
 * These tests pin the two guarantees the LK depends on: members of one logical
 * test come back contiguous and in declared order, and a catalog with no
 * grouping is returned byte-for-byte as it came in.
 */

function p(id: string, key: string | null = null, sequence: number | null = null) {
  return { id, logicalTestKey: key, logicalTestSequence: sequence };
}

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe("orderByLogicalTest", () => {
  it("returns an ungrouped catalog unchanged", () => {
    const input = [p("a"), p("b"), p("c")];
    expect(ids(orderByLogicalTest(input))).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list unchanged", () => {
    expect(orderByLogicalTest([])).toEqual([]);
  });

  it("orders members of one logical test by declared sequence", () => {
    const input = [p("mgy", "dxray-repro", 3), p("kv", "dxray-repro", 1), p("s", "dxray-repro", 2)];
    expect(ids(orderByLogicalTest(input))).toEqual(["kv", "s", "mgy"]);
  });

  it("makes scattered members contiguous at the first member's position", () => {
    const input = [
      p("before"),
      p("kv", "dxray-repro", 1),
      p("unrelated"),
      p("mgy", "dxray-repro", 3),
      p("after"),
      p("s", "dxray-repro", 2),
    ];
    expect(ids(orderByLogicalTest(input))).toEqual([
      "before",
      "kv",
      "s",
      "mgy",
      "unrelated",
      "after",
    ]);
  });

  it("keeps two different logical tests separate and in first-seen order", () => {
    const input = [
      p("stage", "micro-4x", 1),
      p("kv", "dxray-repro", 1),
      p("eyepiece", "micro-4x", 2),
      p("s", "dxray-repro", 2),
    ];
    expect(ids(orderByLogicalTest(input))).toEqual(["stage", "eyepiece", "kv", "s"]);
  });

  it("does not move parameters that surround a group", () => {
    const input = [p("first"), p("kv", "g", 2), p("s", "g", 1), p("last")];
    expect(ids(orderByLogicalTest(input))).toEqual(["first", "s", "kv", "last"]);
  });

  it("is deterministic when a sequence is duplicated across device types", () => {
    // The DB unique index is per (deviceTypeId, key, sequence); a cross-device
    // list can still collide, so the tie-break on id must be total.
    const input = [p("zz", "g", 1), p("aa", "g", 1)];
    expect(ids(orderByLogicalTest(input))).toEqual(["aa", "zz"]);
  });

  it("does not mutate the input array", () => {
    const input = [p("mgy", "g", 2), p("kv", "g", 1)];
    const snapshot = ids(input);
    orderByLogicalTest(input);
    expect(ids(input)).toEqual(snapshot);
  });

  it("treats a group of one exactly like a standalone parameter", () => {
    const input = [p("a"), p("solo", "g", 1), p("b")];
    expect(ids(orderByLogicalTest(input))).toEqual(["a", "solo", "b"]);
  });
});

describe("groupByLogicalTest", () => {
  it("omits ungrouped parameters entirely", () => {
    const map = groupByLogicalTest([p("a"), p("b")]);
    expect(map.size).toBe(0);
  });

  it("returns members in declared order", () => {
    const map = groupByLogicalTest([p("mgy", "g", 3), p("kv", "g", 1), p("s", "g", 2)]);
    expect(ids(map.get("g") ?? [])).toEqual(["kv", "s", "mgy"]);
  });

  it("keys each logical test separately", () => {
    const map = groupByLogicalTest([p("kv", "x", 1), p("stage", "y", 1), p("s", "x", 2)]);
    expect([...map.keys()].sort()).toEqual(["x", "y"]);
    expect(ids(map.get("x") ?? [])).toEqual(["kv", "s"]);
  });
});
