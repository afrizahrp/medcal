import { describe, expect, it } from "vitest";
import { normalizeEmailAddress } from "./email-normalize.util";

describe("normalizeEmailAddress", () => {
  it("lowercases, trims, and strips internal spaces", () => {
    expect(normalizeEmailAddress("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
    expect(normalizeEmailAddress("a b@c.com")).toBe("ab@c.com");
  });
});
