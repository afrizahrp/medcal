// One-time, in the Vitest main process. `pretest`
// (packages/db/scripts/prepare-test-db.mjs) has already migrated + seeded the
// test database; here we scrub any rows leaked by a previous run and restore
// the seeds the API suite depends on (RolePermission cache priming, Menu
// registry), so every run starts from an identical known state.
import { execSync } from "node:child_process";
import { resolve } from "node:path";

import "../../packages/db/src/testing/register";

// Vitest runs the global setup with cwd = apps/api.
const dbRoot = resolve(process.cwd(), "../../packages/db");

async function scrub() {
  const { truncateAllTables } = await import(
    "../../packages/db/src/testing/truncate"
  );
  await truncateAllTables();
}

function reseed() {
  const opts = {
    cwd: dbRoot,
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: "inherit" as const,
  };
  execSync("npx tsx prisma/seed-role-permissions.ts", opts);
  execSync("npx tsx prisma/seed-menu.ts", opts);
  execSync("npx tsx prisma/seed-contact-topics.ts", opts);
}

export async function setup() {
  await scrub();
  reseed();
  const { seedTestFixtures } = await import(
    "../../packages/db/src/testing/fixtures"
  );
  await seedTestFixtures();
}

export async function teardown() {
  await scrub();
  const { prisma } = await import("../../packages/db/src/index");
  await prisma.$disconnect();
}
