"use client";

import { useEffect } from "react";

/**
 * Pure clamp decision — same rule as apps/portal's use-pagination-sync.ts:
 * null = no clamp needed; a `totalPages` below 1 is a genuinely empty result,
 * not a stale page, so it is left alone.
 */
export function resolveClampedPage(page: number, totalPages: number): number | null {
  if (totalPages < 1) return null;
  if (page <= totalPages) return null;
  return totalPages;
}

/**
 * Reconciles a URL-persisted `page` against the response's `totalPages`, so a
 * stale `?page=9` (back button, shrunken results) lands on the last real page
 * instead of an empty one. Unlike the management lists this does not show a
 * "view adjusted" banner — the customer simply sees the last page.
 */
export function usePaginationSync({
  page,
  totalPages,
  onClamp,
}: {
  page: number;
  totalPages: number | undefined;
  onClamp: (lastValidPage: number) => void;
}): void {
  useEffect(() => {
    if (totalPages === undefined) return;
    const clamped = resolveClampedPage(page, totalPages);
    if (clamped !== null) onClamp(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, totalPages]);
}
