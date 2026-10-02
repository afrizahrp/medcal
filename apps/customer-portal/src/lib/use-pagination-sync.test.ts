import { describe, expect, it } from "vitest";
import { resolveClampedPage } from "./use-pagination-sync";

describe("resolveClampedPage", () => {
  it("leaves a valid page alone", () => {
    expect(resolveClampedPage(1, 3)).toBeNull();
    expect(resolveClampedPage(3, 3)).toBeNull();
  });

  it("clamps a page past the end to the last page", () => {
    expect(resolveClampedPage(9, 3)).toBe(3);
  });

  it("does not clamp an empty result set", () => {
    expect(resolveClampedPage(2, 0)).toBeNull();
  });
});
