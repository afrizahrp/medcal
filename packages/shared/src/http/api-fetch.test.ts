import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, isForbidden, isUnauthorized } from "./api-fetch";

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

describe("apiFetch — null/empty-body responses", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockResponse(status: number, body: string, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      headers: new Headers(headers),
      text: () => Promise.resolve(body),
      json: () => Promise.resolve(body === "" ? undefined : JSON.parse(body)),
    } as unknown as Response;
  }

  it("resolves to null for a 200 response with an empty body (Nest's isNil(body) → response.send())", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse(200, ""));
    const result = await apiFetch<{ id: string } | null>("/calibration-jobs/x/certificate");
    expect(result).toBeNull();
  });

  it("still parses a normal JSON body on success", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse(200, JSON.stringify({ id: "abc" })));
    const result = await apiFetch<{ id: string }>("/some-resource");
    expect(result).toEqual({ id: "abc" });
  });

  it("still throws ApiError for a non-ok response, unaffected by the empty-body handling", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockResponse(404, JSON.stringify({ message: "not found" })),
    );
    await expect(apiFetch("/missing")).rejects.toMatchObject({ status: 404 });
  });
});
