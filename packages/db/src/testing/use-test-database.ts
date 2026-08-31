/**
 * Fail-closed test-database guard.
 *
 * Import this FIRST from every Vitest entry point (setup file, global setup)
 * — before any module that constructs the Prisma client — so that
 * `@medcal/db` can only ever talk to a dedicated, disposable test database.
 *
 * This module deliberately imports nothing from `@medcal/db` / `@prisma/client`:
 * it only reads and rewrites `process.env`, which must happen before the client
 * is instantiated.
 *
 * Rules (every one fails closed — the process throws, tests do not run):
 *   1. `TEST_DATABASE_URL` must be set.
 *   2. Its database name must contain "test" (case-insensitive), e.g.
 *      `postgresql://.../pkmdb_test`.
 *   3. It must not resolve to the same database as `DATABASE_URL`.
 *   4. `DATABASE_URL` is then overwritten with `TEST_DATABASE_URL` for the whole
 *      process, so a late or missed env read can never fall back to the
 *      dev / production database.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

let applied: string | null = null;

function tryLoadRepoEnv(): void {
  // In local dev the repo-root .env carries both DATABASE_URL and
  // TEST_DATABASE_URL. In CI there is no .env file and the vars are provided
  // directly — we just skip loading. Vitest runs with cwd = the package dir
  // (packages/db or apps/api), so the repo root is one or two levels up.
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, ".env"),
    resolve(cwd, "../../.env"),
    resolve(cwd, "../../../.env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      // Node >= 20.12
      process.loadEnvFile(path);
      return;
    } catch {
      // try next / rely on real env
    }
  }
}

function databaseName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, "").split("?")[0] ?? "";
  } catch {
    return "";
  }
}

/** Same host + port + database — query string and credentials ignored. */
function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.host === ub.host &&
      ua.pathname.split("?")[0] === ub.pathname.split("?")[0]
    );
  } catch {
    return a.trim() === b.trim();
  }
}

/**
 * Redirects `process.env.DATABASE_URL` at the test database or throws.
 * Idempotent: safe to call from both globalSetup and per-worker setupFiles.
 * Returns the resolved test database URL.
 */
export function useTestDatabase(): string {
  if (applied) return applied;

  tryLoadRepoEnv();

  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testUrl) {
    throw new Error(
      "[test-db guard] TEST_DATABASE_URL is not set. Device Management (and all " +
        "other) tests refuse to run without an explicit dedicated test database. " +
        "They will NOT fall back to DATABASE_URL. See .env.example.",
    );
  }

  const name = databaseName(testUrl);
  if (!/test/i.test(name)) {
    throw new Error(
      `[test-db guard] TEST_DATABASE_URL does not point at a test database ` +
        `(database name = "${name || "<unparseable>"}"). Its database name must ` +
        `contain "test", e.g. "postgresql://.../pkmdb_test".`,
    );
  }

  const devUrl = process.env.DATABASE_URL?.trim();
  // `devUrl === testUrl` means DATABASE_URL was already redirected here (a
  // worker process inheriting the parent's env) — that is the desired state.
  // Reject only when DATABASE_URL still names a *different* connection string
  // that nonetheless resolves to the same physical database.
  if (devUrl && devUrl !== testUrl && sameDatabase(devUrl, testUrl)) {
    throw new Error(
      "[test-db guard] TEST_DATABASE_URL resolves to the same physical database " +
        "as DATABASE_URL. The test database must be separate from the " +
        "dev / production one.",
    );
  }

  process.env.DATABASE_URL = testUrl;
  applied = testUrl;
  return testUrl;
}
