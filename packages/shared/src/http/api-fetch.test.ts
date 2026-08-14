import { describe, expect, it } from "vitest";
import { ApiError, isForbidden, isUnauthorized } from "./api-fetch";

describe("apiFetch error classification", () => {
  it("classifies 401 as unauthorized, not forbidden", () => {
    const error = new ApiError(401, "Unauthorized");
    expect(isUnauthorized(error)).toBe(true);
    expect(isForbidden(error)).toBe(false);
  });

  it("classifies 403 as forbidden, not unauthorized", () => {
    const error = new ApiError(403, "Forbidden");
    expect(isForbidden(error)).toBe(true);
    expect(isUnauthorized(error)).toBe(false);
  });

  it("does not classify non-ApiError values as unauthorized/forbidden", () => {
    const error = new Error("network down");
    expect(isUnauthorized(error)).toBe(false);
    expect(isForbidden(error)).toBe(false);
  });
});
