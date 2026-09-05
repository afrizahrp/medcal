"use client";

import { useEffect, useState } from "react";

/**
 * Pure clamp decision (unit-tested in isolation, mirrors `resolveNextSort` in
 * use-table-sort.ts): null = no clamp needed. A `totalPages` of 0 means a
 * genuinely empty result set — not a stale-page artifact — so it's left
 * alone rather than "clamped" to some page that doesn't exist either.
 */
export function resolveClampedPage(page: number, totalPages: number): number | null {
  if (totalPages < 1) return null;
  if (page <= totalPages) return null;
  return totalPages;
}

/**
 * Reconciles a URL-persisted `page` (Management List canonical pattern) against
 * the list response's own `totalPages`. Browser Back/Forward is the only way a
 * stale `page` resurfaces (no code in this app calls `router.back()`, and
 * `useUrlQueryState` only ever `router.replace`s), replaying it against data
 * that may have shrunk or reordered since — this corrects it instead of
 * rendering whatever empty/wrong slice the stale page happens to return.
 *
 * `onClamp` is the only thing that touches URL state; it stays owned by the
 * calling page-client (`setParams({ page: ... })`) so this hook doesn't need
 * to know each page's `URL_KEYS` union.
 *
 * `didClamp` latches to `true` for `dismissAfterMs` once a clamp fires,
 * decoupled from the page/totalPages effect — otherwise it would flip back
 * off on the very next render, the instant the URL self-corrects, and the
 * banner would never actually be visible.
 */
export function usePaginationSync({
  page,
  totalPages,
  onClamp,
  dismissAfterMs = 6000,
}: {
  /** Current page from the URL. */
  page: number;
  /** The list query's own `totalPages` — undefined while data hasn't loaded yet. */
  totalPages: number | undefined;
  /** Called with the corrected page when a clamp is needed. */
  onClamp: (lastValidPage: number) => void;
  dismissAfterMs?: number;
}): { didClamp: boolean; dismiss: () => void } {
  const [didClamp, setDidClamp] = useState(false);

  useEffect(() => {
    if (totalPages === undefined) return;
    const clamped = resolveClampedPage(page, totalPages);
    if (clamped === null) return;
    setDidClamp(true);
    onClamp(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, totalPages]);

  useEffect(() => {
    if (!didClamp) return;
    const timer = setTimeout(() => setDidClamp(false), dismissAfterMs);
    return () => clearTimeout(timer);
  }, [didClamp, dismissAfterMs]);

  return { didClamp, dismiss: () => setDidClamp(false) };
}
