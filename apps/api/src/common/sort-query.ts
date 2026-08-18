/**
 * Whitelist-enforced sort resolution for management list endpoints
 * (Management List canonical pattern, 2026-08-18). `sortBy`/`sortDir` are
 * client-controlled query params — never interpolate them into a Prisma
 * `orderBy` directly. This is the single trust boundary: an unknown/omitted
 * `sortBy` falls back to `fallbackField`, and `sortDir` defaults to "desc"
 * only when genuinely absent, never ambiguously (the forensic report found
 * server-bi-erp's sortFieldBy.ts documents an "asc" default in its function
 * signature while the body actually coerces anything not exactly "asc" to
 * "desc" — this implementation has one explicit rule, not two disagreeing
 * ones).
 */
export function resolveSortOrder<T extends string>(
  allowed: readonly T[],
  sortBy: string | undefined,
  sortDir: "asc" | "desc" | undefined,
  fallbackField: T,
): { field: T; dir: "asc" | "desc" } {
  const field = allowed.includes(sortBy as T) ? (sortBy as T) : fallbackField;
  const dir = sortDir === "asc" ? "asc" : "desc";
  return { field, dir };
}
