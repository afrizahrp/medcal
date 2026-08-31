// One-time, in the Vitest main process: guarantee the test database starts and
// ends empty regardless of how a previous run exited. `pretest`
// (scripts/prepare-test-db.mjs) has already migrated it; the @medcal/db suite
// (master-code, document-number) creates all the rows it needs itself.
import { useTestDatabase } from "./src/testing/use-test-database";

async function scrub() {
  useTestDatabase();
  const { truncateAllTables } = await import("./src/testing/truncate");
  await truncateAllTables();
}

export async function setup() {
  await scrub();
}

export async function teardown() {
  await scrub();
  const { prisma } = await import("./src/index");
  await prisma.$disconnect();
}
