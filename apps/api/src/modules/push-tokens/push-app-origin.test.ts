import { describe, expect, it } from "vitest";
import { normalizeOrigin, resolvePushAppFromOrigin } from "./push-app-origin";

const env = {
  TRUSTED_ORIGINS:
    "https://kalibrasimedika.co.id,https://apps.kalibrasimedika.co.id,https://technician.kalibrasimedika.co.id,https://customer.kalibrasimedika.co.id",
  PORTAL_ORIGINS: "https://apps.kalibrasimedika.co.id",
  TECH_PWA_ORIGINS: "https://technician.kalibrasimedika.co.id",
};

describe("resolvePushAppFromOrigin", () => {
  it("maps a known portal origin to PORTAL", () => {
    expect(resolvePushAppFromOrigin("https://apps.kalibrasimedika.co.id", env)).toBe("PORTAL");
  });

  it("maps a known tech-pwa origin to TECH_PWA", () => {
    expect(resolvePushAppFromOrigin("https://technician.kalibrasimedika.co.id", env)).toBe("TECH_PWA");
  });

  it("rejects a trusted origin that belongs to neither app (marketing site, customer portal)", () => {
    expect(resolvePushAppFromOrigin("https://kalibrasimedika.co.id", env)).toBeNull();
    expect(resolvePushAppFromOrigin("https://customer.kalibrasimedika.co.id", env)).toBeNull();
  });

  it("rejects an unknown (untrusted) origin", () => {
    expect(resolvePushAppFromOrigin("https://evil.example.com", env)).toBeNull();
    expect(resolvePushAppFromOrigin("https://technician.kalibrasimedika.co.id.evil.example.com", env)).toBeNull();
  });

  it("rejects missing, empty, opaque and malformed origins", () => {
    expect(resolvePushAppFromOrigin(undefined, env)).toBeNull();
    expect(resolvePushAppFromOrigin("", env)).toBeNull();
    expect(resolvePushAppFromOrigin("null", env)).toBeNull();
    expect(resolvePushAppFromOrigin("not a url", env)).toBeNull();
  });

  it("is insensitive to case and a trailing slash in the configured lists", () => {
    const loose = {
      TRUSTED_ORIGINS: "https://Apps.Kalibrasimedika.co.id/, https://technician.kalibrasimedika.co.id/",
      PORTAL_ORIGINS: "https://APPS.kalibrasimedika.co.id/",
      TECH_PWA_ORIGINS: "https://TECHNICIAN.kalibrasimedika.co.id/",
    };
    expect(resolvePushAppFromOrigin("https://apps.kalibrasimedika.co.id", loose)).toBe("PORTAL");
    expect(resolvePushAppFromOrigin("https://technician.kalibrasimedika.co.id", loose)).toBe("TECH_PWA");
  });

  it("does not match a different port or scheme of a listed host", () => {
    expect(resolvePushAppFromOrigin("http://technician.kalibrasimedika.co.id", env)).toBeNull();
    expect(resolvePushAppFromOrigin("https://technician.kalibrasimedika.co.id:8443", env)).toBeNull();
  });

  it("does not let PORTAL_ORIGINS/TECH_PWA_ORIGINS grant an origin that is not in TRUSTED_ORIGINS", () => {
    const misconfigured = {
      TRUSTED_ORIGINS: "https://apps.kalibrasimedika.co.id",
      PORTAL_ORIGINS: "https://rogue.example.com",
      TECH_PWA_ORIGINS: "https://rogue2.example.com",
    };
    expect(resolvePushAppFromOrigin("https://rogue.example.com", misconfigured)).toBeNull();
    expect(resolvePushAppFromOrigin("https://rogue2.example.com", misconfigured)).toBeNull();
  });

  it("rejects an origin listed under both apps (ambiguous)", () => {
    const ambiguous = { ...env, PORTAL_ORIGINS: env.TECH_PWA_ORIGINS };
    expect(resolvePushAppFromOrigin("https://technician.kalibrasimedika.co.id", ambiguous)).toBeNull();
  });

  it("fails closed when TECH_PWA_ORIGINS is not configured: technician origin is rejected, portal still works", () => {
    const { TECH_PWA_ORIGINS: _omit, ...withoutTech } = env;
    expect(resolvePushAppFromOrigin("https://technician.kalibrasimedika.co.id", withoutTech)).toBeNull();
    expect(resolvePushAppFromOrigin("https://apps.kalibrasimedika.co.id", withoutTech)).toBe("PORTAL");
  });

  it("fails closed when PORTAL_ORIGINS is not configured", () => {
    const { PORTAL_ORIGINS: _omit, ...withoutPortal } = env;
    expect(resolvePushAppFromOrigin("https://apps.kalibrasimedika.co.id", withoutPortal)).toBeNull();
  });

  it("returns null for every origin when TRUSTED_ORIGINS is unset", () => {
    expect(resolvePushAppFromOrigin("https://apps.kalibrasimedika.co.id", { ...env, TRUSTED_ORIGINS: undefined })).toBeNull();
  });
});

describe("normalizeOrigin", () => {
  it("rejects non-http(s) schemes", () => {
    expect(normalizeOrigin("file:///etc/passwd")).toBeNull();
    expect(normalizeOrigin("chrome-extension://abc")).toBeNull();
  });
});
