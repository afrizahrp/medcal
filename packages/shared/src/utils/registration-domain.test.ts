import { describe, expect, it } from "vitest";
import { isAllowedRegistrationDomain } from "./index";

describe("isAllowedRegistrationDomain", () => {
  it("allows a valid @kalibrasimedika.co.id address", () => {
    expect(isAllowedRegistrationDomain("user@kalibrasimedika.co.id")).toBe(true);
  });

  it("allows mixed-case and surrounding whitespace", () => {
    expect(isAllowedRegistrationDomain("  User@KALIBRASIMEDIKA.CO.ID  ")).toBe(true);
  });

  it("rejects an unrelated public domain (gmail)", () => {
    expect(isAllowedRegistrationDomain("user@gmail.com")).toBe(false);
  });

  it("rejects a subdomain-suffix trick (kalibrasimedika.co.id.evil.com)", () => {
    expect(isAllowedRegistrationDomain("user@kalibrasimedika.co.id.evil.com")).toBe(false);
  });

  it("rejects a prefix trick (evilkalibrasimedika.co.id)", () => {
    expect(isAllowedRegistrationDomain("user@evilkalibrasimedika.co.id")).toBe(false);
  });

  it("rejects malformed input with multiple @ characters", () => {
    expect(isAllowedRegistrationDomain("user@kalibrasimedika.co.id@evil.com")).toBe(false);
  });
});
