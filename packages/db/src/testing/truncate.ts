import { prisma } from "../index";

/**
 * Deterministic teardown for the test database: empties every application table
 * in one statement. `RESTART IDENTITY` resets serial counters; `CASCADE` follows
 * FKs so ordering never matters. `_prisma_migrations` is preserved so the schema
 * stays migrated between runs.
 *
 * Only ever run this against the dedicated test database — `useTestDatabase()`
 * must already have redirected `DATABASE_URL`.
 */
export async function truncateAllTables(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;

  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
