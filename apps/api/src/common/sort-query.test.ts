import { describe, expect, it } from "vitest";
import { resolveSortOrder } from "./sort-query";

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
