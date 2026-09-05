import { describe, expect, it } from "vitest";
import { resolveClampedPage } from "./use-pagination-sync";

describe("resolveClampedPage", () => {
  it("does nothing when the page is already in range", () => {
    expect(resolveClampedPage(1, 3)).toBeNull();
    expect(resolveClampedPage(3, 3)).toBeNull();
  });

  it("clamps a stale page that now exceeds totalPages", () => {
    expect(resolveClampedPage(5, 3)).toBe(3);
    expect(resolveClampedPage(2, 1)).toBe(1);
  });

  it("does not clamp a genuinely empty result set", () => {
    expect(resolveClampedPage(1, 0)).toBeNull();
    expect(resolveClampedPage(5, 0)).toBeNull();
  });
});
