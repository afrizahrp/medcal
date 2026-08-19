import { describe, expect, it } from "vitest";
import { hasPermission } from "./access-control";

describe("hasPermission — lead resource (Lead Inbox, locked 2026-08-16 Decision 5: per-verb)", () => {
  it("grants SUPERADMIN lead:read and lead:update", () => {
    expect(hasPermission("SUPERADMIN", "lead", "read")).toBe(true);
    expect(hasPermission("SUPERADMIN", "lead", "update")).toBe(true);
  });

  it("grants ADMIN lead:read and lead:update", () => {
    expect(hasPermission("ADMIN", "lead", "read")).toBe(true);
    expect(hasPermission("ADMIN", "lead", "update")).toBe(true);
  });

  it("denies roles with no lead grant", () => {
    expect(hasPermission("SUPERVISOR", "lead", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "lead", "read")).toBe(false);
    expect(hasPermission("FINANCE", "lead", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "lead", "read")).toBe(false);
  });

  it("has no lead:assign action in the catalog — assignment is out of scope for v1 (Decision 3)", () => {
    expect(hasPermission("SUPERADMIN", "lead", "assign")).toBe(false);
  });
});

describe("hasPermission — existing contactMessage/whitelist grants unchanged", () => {
  it("still grants contactMessage:read to SUPERADMIN and ADMIN only", () => {
    expect(hasPermission("SUPERADMIN", "contactMessage", "read")).toBe(true);
    expect(hasPermission("ADMIN", "contactMessage", "read")).toBe(true);
    expect(hasPermission("SUPERVISOR", "contactMessage", "read")).toBe(false);
  });

  it("still grants whitelist:manage to SUPERADMIN only", () => {
    expect(hasPermission("SUPERADMIN", "whitelist", "manage")).toBe(true);
    expect(hasPermission("ADMIN", "whitelist", "manage")).toBe(false);
  });
});

describe("hasPermission — users resource (User Management, locked 2026-08-19 G1-G4)", () => {
  it("grants SUPERADMIN users:read and users:manage", () => {
    expect(hasPermission("SUPERADMIN", "users", "read")).toBe(true);
    expect(hasPermission("SUPERADMIN", "users", "manage")).toBe(true);
  });

  it("grants ADMIN users:read but NOT users:manage", () => {
    expect(hasPermission("ADMIN", "users", "read")).toBe(true);
    expect(hasPermission("ADMIN", "users", "manage")).toBe(false);
  });

  it("denies roles with no users grant", () => {
    expect(hasPermission("SUPERVISOR", "users", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "users", "read")).toBe(false);
    expect(hasPermission("FINANCE", "users", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "users", "read")).toBe(false);
  });
});

describe("hasPermission — membership resource (User Management, locked 2026-08-19 G1-G4)", () => {
  it("grants SUPERADMIN membership:manage", () => {
    expect(hasPermission("SUPERADMIN", "membership", "manage")).toBe(true);
  });

  it("grants ADMIN membership:manage", () => {
    expect(hasPermission("ADMIN", "membership", "manage")).toBe(true);
  });

  it("denies roles with no membership grant", () => {
    expect(hasPermission("SUPERVISOR", "membership", "manage")).toBe(false);
    expect(hasPermission("TECHNICIAN", "membership", "manage")).toBe(false);
    expect(hasPermission("FINANCE", "membership", "manage")).toBe(false);
    expect(hasPermission("CUSTOMER", "membership", "manage")).toBe(false);
  });
});
