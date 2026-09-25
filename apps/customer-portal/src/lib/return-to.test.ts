import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "./return-to";

describe("sanitizeReturnTo", () => {
  it("allows a plain internal path", () => {
    expect(sanitizeReturnTo("/certificate/ABC123")).toBe("/certificate/ABC123");
  });

  it("allows an internal path with query and hash", () => {
    expect(sanitizeReturnTo("/certificate/ABC123?ref=qr#top")).toBe(
      "/certificate/ABC123?ref=qr#top",
    );
  });

  it("falls back to / for null, undefined, or empty", () => {
    expect(sanitizeReturnTo(null)).toBe("/");
    expect(sanitizeReturnTo(undefined)).toBe("/");
    expect(sanitizeReturnTo("")).toBe("/");
  });

  it("rejects an absolute external URL", () => {
    expect(sanitizeReturnTo("https://evil.example")).toBe("/");
    expect(sanitizeReturnTo("http://evil.example/certificate/ABC123")).toBe("/");
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeReturnTo("//evil.example")).toBe("/");
    expect(sanitizeReturnTo("//evil.example/certificate/ABC123")).toBe("/");
  });

  it("rejects a backslash-based protocol-relative trick", () => {
    expect(sanitizeReturnTo("/\\evil.example")).toBe("/");
  });

  it("rejects a scheme not starting with /", () => {
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/");
  });

  it("rejects a value with an embedded scheme after the leading slash", () => {
    expect(sanitizeReturnTo("/https://evil.example")).toBe("/");
  });
});
