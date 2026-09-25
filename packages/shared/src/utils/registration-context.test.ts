import { describe, expect, it } from "vitest";
import { resolveRegistrationContext } from "./index";

describe("resolveRegistrationContext", () => {
  it("resolves apps.* origins to INTERNAL_STAFF", () => {
    expect(resolveRegistrationContext("https://apps.kalibrasimedika.co.id")).toBe("INTERNAL_STAFF");
    expect(resolveRegistrationContext("http://apps.localhost:3003")).toBe("INTERNAL_STAFF");
  });

  it("resolves portal.* origins to CUSTOMER_PORTAL", () => {
    expect(resolveRegistrationContext("https://portal.kalibrasimedika.co.id")).toBe("CUSTOMER_PORTAL");
    expect(resolveRegistrationContext("http://portal.localhost:3003")).toBe("CUSTOMER_PORTAL");
  });

  it("resolves customer.* origins to CUSTOMER_PORTAL (apps/customer-portal)", () => {
    expect(resolveRegistrationContext("https://customer.kalibrasimedika.co.id")).toBe("CUSTOMER_PORTAL");
    expect(resolveRegistrationContext("http://customer.localhost:3005")).toBe("CUSTOMER_PORTAL");
  });

  it("returns null for an unrecognized origin", () => {
    expect(resolveRegistrationContext("https://technician.kalibrasimedika.co.id")).toBeNull();
    expect(resolveRegistrationContext("https://evil.com")).toBeNull();
  });

  it("returns null for a missing/empty origin", () => {
    expect(resolveRegistrationContext(null)).toBeNull();
    expect(resolveRegistrationContext(undefined)).toBeNull();
    expect(resolveRegistrationContext("")).toBeNull();
  });

  it("returns null for a malformed origin", () => {
    expect(resolveRegistrationContext("not-a-url")).toBeNull();
  });

  it("falls back to DEV_DEFAULT_HOST_GROUP for plain localhost with no subdomain", () => {
    expect(resolveRegistrationContext("http://localhost:3003")).toBe("INTERNAL_STAFF");
    expect(resolveRegistrationContext("http://localhost:3003", "client")).toBe("CUSTOMER_PORTAL");
    expect(resolveRegistrationContext("http://localhost:3003", "management")).toBe("INTERNAL_STAFF");
  });
});
