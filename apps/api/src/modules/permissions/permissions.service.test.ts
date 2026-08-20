import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { loadRolePermissionCache } from "@medcal/auth";
import { PermissionsService } from "./permissions.service";

// Real Postgres, same DATABASE_URL apps/api's dev script uses (loaded via
// vitest.setup.ts). No mocking — consistent with whitelist.service.test.ts.
// A dedicated FINANCE-role fixture is used (never a role real seed data
// touches beyond `managementDashboard:read`), so this suite doesn't disturb
// the shared dev DB's SUPERVISOR/ADMIN grants.

const TEST_ROLE: MembershipRole = "FINANCE";
const shortId = randomUUID().slice(0, 8);
const actorId = `perm-actor-${shortId}`;
const service = new PermissionsService();

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: actorId },
    create: { id: actorId, email: `${actorId}@kalibrasimedika.co.id`, status: "ACTIVE" },
    update: {},
  });
});

afterEach(async () => {
  // Restore FINANCE to its real baseline (managementDashboard:read only) after each test.
  await prisma.rolePermission.deleteMany({ where: { role: TEST_ROLE } });
  await prisma.rolePermission.create({
    data: { role: TEST_ROLE, resource: "managementDashboard", action: "read" },
  });
  await loadRolePermissionCache();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: actorId } });
  await prisma.$disconnect();
});

describe("PermissionsService.replaceRole", () => {
  it("rejects unknown resource/action pairs with 400 and creates no rows", async () => {
    await expect(
      service.replaceRole(TEST_ROLE, [{ resource: "not-a-real-resource", action: "read" }], actorId),
    ).rejects.toMatchObject({ status: 400, response: { code: "UNKNOWN_PERMISSION" } });

    const rows = await prisma.rolePermission.findMany({ where: { role: TEST_ROLE, resource: "not-a-real-resource" } });
    expect(rows).toHaveLength(0);
  });

  it("rejects a known resource with an action it doesn't support", async () => {
    await expect(
      service.replaceRole(TEST_ROLE, [{ resource: "whitelist", action: "delete" }], actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects SUPERADMIN edits with 400", async () => {
    await expect(
      service.replaceRole("SUPERADMIN", [{ resource: "lead", action: "read" }], actorId),
    ).rejects.toMatchObject({ status: 400, response: { code: "SUPERADMIN_NOT_EDITABLE" } });
  });

  it("atomically replaces the role's grants — old rows gone, new rows present", async () => {
    const result = await service.replaceRole(
      TEST_ROLE,
      [
        { resource: "lead", action: "read" },
        { resource: "whitelist", action: "manage" },
      ],
      actorId,
    );

    expect(result.grants).toHaveLength(2);
    expect(result.readOnly).toBe(false);

    const rows = await prisma.rolePermission.findMany({ where: { role: TEST_ROLE } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.createdByUserId === actorId)).toBe(true);
    // The pre-existing managementDashboard:read grant is gone — replace, not merge.
    expect(rows.some((r) => r.resource === "managementDashboard")).toBe(false);
  });

  it("dedupes duplicate pairs in the input without throwing", async () => {
    const result = await service.replaceRole(
      TEST_ROLE,
      [
        { resource: "lead", action: "read" },
        { resource: "lead", action: "read" },
      ],
      actorId,
    );
    expect(result.grants).toHaveLength(1);
  });

  it("refreshes the live cache so hasPermission reflects the change immediately", async () => {
    const { hasPermission } = await import("@medcal/auth");
    expect(hasPermission(TEST_ROLE, "lead", "read")).toBe(false);
    await service.replaceRole(TEST_ROLE, [{ resource: "lead", action: "read" }], actorId);
    expect(hasPermission(TEST_ROLE, "lead", "read")).toBe(true);
  });
});

describe("PermissionsService.getRole", () => {
  it("synthesizes SUPERADMIN as the full catalog, read-only", async () => {
    const result = await service.getRole("SUPERADMIN");
    expect(result.readOnly).toBe(true);
    expect(result.grants.some((g) => g.resource === "permission" && g.action === "manage")).toBe(true);
  });
});
