import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  CUSTOMER_QUERY_ROOT,
  customerQueryKey,
  isUnauthorizedError,
  shouldRetry,
} from "./customer-query";

describe("customerQueryKey", () => {
  it("scopes every key to the signed-in user so two users never share a cache entry", () => {
    const a = customerQueryKey("user-a", "work-orders", { search: "x" });
    const b = customerQueryKey("user-b", "work-orders", { search: "x" });
    expect(a[0]).toBe(CUSTOMER_QUERY_ROOT);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it("gives different filters different keys", () => {
    const base = { search: "", status: "", progress: "", certificate: "", page: 1 };
    const keys = [
      base,
      { ...base, search: "pompa" },
      { ...base, status: "IN_PROGRESS" },
      { ...base, progress: "ALL_COMPLETED" },
      { ...base, certificate: "AVAILABLE" },
      { ...base, page: 2 },
    ].map((params) => JSON.stringify(customerQueryKey("user-a", "work-orders", params)));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not collide a signed-out key with a user key", () => {
    expect(customerQueryKey(null, "x")).not.toEqual(customerQueryKey("null", "x"));
  });
});

describe("shouldRetry", () => {
  it("never retries a client error, so 401/403/404 surface immediately", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(shouldRetry(0, new ApiError(status, "x"))).toBe(false);
    }
  });

  it("retries a server or network failure once, then gives up", () => {
    expect(shouldRetry(0, new ApiError(500, "x"))).toBe(true);
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(1, new ApiError(500, "x"))).toBe(false);
  });
});

describe("isUnauthorizedError", () => {
  it("is true only for a 401, never a 403", () => {
    expect(isUnauthorizedError(new ApiError(401, "x"))).toBe(true);
    expect(isUnauthorizedError(new ApiError(403, "x"))).toBe(false);
    expect(isUnauthorizedError(new Error("x"))).toBe(false);
  });
});
