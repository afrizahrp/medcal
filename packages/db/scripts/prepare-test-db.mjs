/**
 * Prepares the dedicated test database before a Vitest run:
 *   1. fail-closed validation of TEST_DATABASE_URL
 *   2. `prisma migrate deploy` against it
 *   3. the seeds tests depend on but never create themselves
 *      (RolePermission cache priming, Menu registry)
 *
 * Wired as the `pretest` lifecycle script, so `pnpm --filter @medcal/db test`
 * and `pnpm --filter @medcal/api test` both run it automatically.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dbPackageRoot = resolve(here, "..");
const repoRoot = resolve(dbPackageRoot, "..", "..");

const envFile = resolve(repoRoot, ".env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* rely on real env */
  }
}

const testUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testUrl) {
  console.error(
    "[prepare-test-db] TEST_DATABASE_URL is not set — refusing to run tests " +
      "against DATABASE_URL. Add it to .env (see .env.example).",
  );
  process.exit(1);
}

const dbName = (() => {
  try {
    return new URL(testUrl).pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
})();
if (!/test/i.test(dbName)) {
  console.error(
    `[prepare-test-db] TEST_DATABASE_URL database name "${dbName}" does not ` +
      'contain "test". Refusing to migrate/seed a possibly-real database.',
  );
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: testUrl };

function run(cmd) {
  execSync(cmd, { cwd: dbPackageRoot, env, stdio: "inherit" });
}

console.log(`[prepare-test-db] target: ${dbName}`);
run("npx prisma migrate deploy");
run("npx tsx prisma/seed-role-permissions.ts");
run("npx tsx prisma/backfill-identity-correction-permissions.ts");
run("npx tsx prisma/backfill-rework-resume-permissions.ts");
run("npx tsx prisma/backfill-physical-check-permissions.ts");
run("npx tsx prisma/seed-menu.ts");
console.log("[prepare-test-db] ready.");
