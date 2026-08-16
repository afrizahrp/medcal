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
