/**
 * UX-06 — Job Detail groups several independent TanStack Query results
 * (e.g. Physical Check's items + results catalogs, Measurement's parameters
 * + results) into one meaningful loading/error section instead of the page
 * reading as a cascade of unrelated spinners/retries.
 *
 * This does NOT change which queries fire, when they fire, or any gating
 * logic (`shouldShowPhysicalCheckSection`, `shouldShowMeasurementSection`,
 * `canSubmitForReview`, etc. are untouched and read from their own query
 * results exactly as before) — it only combines the *presentation* of
 * pending/error state for queries that already render as one section.
 *
 * Pure and framework-free so the combination rule can be unit tested without
 * any DOM/React test infrastructure, per this repo's Vitest convention.
 */

export interface BasicQueryState {
  isPending: boolean;
  isError: boolean;
}

export interface QueryGroupState {
  /** True while any query in the group is still pending. */
  isPending: boolean;
  /** True once at least one query in the group has settled with an error. */
  isError: boolean;
  /**
   * Index (into the input array) of the first errored query, so the caller
   * can still show that specific query's own error message/retry — grouping
   * the *loading* state must never hide *which* request failed.
   */
  firstErrorIndex: number | null;
}

export function combineQueryGroupState(queries: BasicQueryState[]): QueryGroupState {
  const isPending = queries.some((q) => q.isPending);
  const firstErrorIndex = queries.findIndex((q) => q.isError);
  return {
    isPending,
    isError: firstErrorIndex !== -1,
    firstErrorIndex: firstErrorIndex === -1 ? null : firstErrorIndex,
  };
}
