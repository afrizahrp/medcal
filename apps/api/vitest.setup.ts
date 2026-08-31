// MUST be first: redirects DATABASE_URL at the dedicated test database (or
// throws) before any later import constructs the Prisma client. Never falls
// back to DATABASE_URL.
import "../../packages/db/src/testing/register";

import { beforeAll } from "vitest";
import { loadRolePermissionCache } from "@medcal/auth";

// hasPermission() reads a synchronous in-memory cache backed by the
// RolePermission table. In production this is primed once at API boot
// (main.ts); tests need the same priming so hasPermission() doesn't fail
// closed against a null cache. The test database's RolePermission rows are
// seeded by `pretest` (packages/db/scripts/prepare-test-db.mjs) and restored
// by the global setup.
beforeAll(async () => {
  await loadRolePermissionCache();
});
