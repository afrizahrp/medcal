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

/**
 * Deterministic Prisma `orderBy` for a paginated list: the resolved sort field
 * followed by a stable `id` tie-breaker so rows with equal sort values keep a
 * fixed order across pages (avoids the "same row on two pages" pagination bug,
 * task §6). `tieBreaker` defaults to `"id"` — pass `null` for a model without an
 * `id` column, or another column name to tie-break on that instead. The
 * tie-breaker is dropped when it would duplicate the primary sort field.
 */
export function resolveOrderBy<T extends string>(
  allowed: readonly T[],
  sortBy: string | undefined,
  sortDir: "asc" | "desc" | undefined,
  fallbackField: T,
  tieBreaker: string | null = "id",
): Array<Record<string, "asc" | "desc">> {
  const { field, dir } = resolveSortOrder(allowed, sortBy, sortDir, fallbackField);
  if (!tieBreaker || tieBreaker === field) return [{ [field]: dir }];
  return [{ [field]: dir }, { [tieBreaker]: "desc" }];
}

/**
 * Append a stable `id` tie-breaker to an already-resolved sort field/direction.
 * Convenience for the common case where `resolveSortOrder` was already called
 * and only the final Prisma `orderBy` needs to become deterministic. Drops the
 * tie-breaker when the primary sort is already `id`.
 */
export function withIdTieBreaker(
  sortField: string,
  sortDir: "asc" | "desc",
): Array<Record<string, "asc" | "desc">> {
  if (sortField === "id") return [{ id: sortDir }];
  return [{ [sortField]: sortDir }, { id: "desc" }];
}
