import { describe, expect, it } from "vitest";
import { resolveOrderBy, resolveSortOrder, withIdTieBreaker } from "./sort-query";

const ALLOWED = ["createdAt", "name", "status"] as const;

describe("resolveSortOrder", () => {
  it("falls back to the given field when sortBy is undefined", () => {
    expect(resolveSortOrder(ALLOWED, undefined, undefined, "createdAt")).toEqual({
      field: "createdAt",
      dir: "desc",
    });
  });

  it("falls back to the given field when sortBy is not in the whitelist", () => {
    expect(resolveSortOrder(ALLOWED, "companyId", undefined, "createdAt")).toEqual({
      field: "createdAt",
      dir: "desc",
    });
  });

  it("accepts a whitelisted sortBy", () => {
    expect(resolveSortOrder(ALLOWED, "name", undefined, "createdAt")).toEqual({
      field: "name",
      dir: "desc",
    });
  });

  it("defaults sortDir to desc when undefined", () => {
    expect(resolveSortOrder(ALLOWED, "name", undefined, "createdAt").dir).toBe("desc");
  });

  it("respects an explicit asc sortDir", () => {
    expect(resolveSortOrder(ALLOWED, "name", "asc", "createdAt").dir).toBe("asc");
  });

  it("respects an explicit desc sortDir", () => {
    expect(resolveSortOrder(ALLOWED, "name", "desc", "createdAt").dir).toBe("desc");
  });
});

describe("resolveOrderBy", () => {
  it("appends a stable id tie-breaker after the resolved field", () => {
    expect(resolveOrderBy(ALLOWED, "name", "asc", "createdAt")).toEqual([
      { name: "asc" },
      { id: "desc" },
    ]);
  });

  it("falls back to the default field for an unwhitelisted sortBy", () => {
    expect(resolveOrderBy(ALLOWED, "password", undefined, "createdAt")).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("drops the tie-breaker when the primary sort is already id", () => {
    expect(resolveOrderBy([...ALLOWED, "id"] as const, "id", "asc", "createdAt")).toEqual([
      { id: "asc" },
    ]);
  });

  it("supports a custom tie-breaker column", () => {
    expect(resolveOrderBy(ALLOWED, "status", "asc", "createdAt", "createdAt")).toEqual([
      { status: "asc" },
      { createdAt: "desc" },
    ]);
  });

  it("omits the tie-breaker entirely when passed null", () => {
    expect(resolveOrderBy(ALLOWED, "name", "asc", "createdAt", null)).toEqual([{ name: "asc" }]);
  });
});

describe("withIdTieBreaker", () => {
  it("appends id desc to a resolved field/direction pair", () => {
    expect(withIdTieBreaker("status", "asc")).toEqual([{ status: "asc" }, { id: "desc" }]);
  });

  it("does not duplicate id when it is the primary sort", () => {
    expect(withIdTieBreaker("id", "asc")).toEqual([{ id: "asc" }]);
  });
});
