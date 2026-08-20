import path from "node:path";
import { beforeAll } from "vitest";
import { loadRolePermissionCache } from "@medcal/auth";

// Integration tests (registration-gate.integration.test.ts) hit the real
// Postgres configured for local dev, same DATABASE_URL apps/api's dev script uses.
process.loadEnvFile(path.resolve(__dirname, "../../.env"));

// hasPermission() reads a synchronous in-memory cache backed by the
// RolePermission table. In production this is primed once at API boot
// (main.ts); tests need the same priming so hasPermission() doesn't fail
// closed against a null cache.
beforeAll(async () => {
  await loadRolePermissionCache();
});
