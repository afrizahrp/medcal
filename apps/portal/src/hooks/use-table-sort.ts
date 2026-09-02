"use client";

import { useCallback } from "react";

export type SortDir = "asc" | "desc";

export interface TableSort {
  /** Currently active sort column (resolved — never undefined). */
  sortBy: string;
  /** Currently active sort direction (resolved — never undefined). */
  sortDir: SortDir;
  /** Toggle handler for a column header. */
  onSort: (field: string) => void;
}

/**
 * Pure sort-toggle rule (unit-tested): clicking a new column sorts it
 * ascending; clicking the active column flips asc ⇄ desc. Returns the new
 * `sortBy` / `sortDir`, plus `isDefault` so the caller can drop them from the
 * URL when they equal the module default (keeps the bare list URL clean —
 * task §12 backward-compat).
 */
export function resolveNextSort(
  current: { sortBy: string; sortDir: SortDir },
  field: string,
  defaultField: string,
  defaultDir: SortDir,
): { sortBy: string; sortDir: SortDir; isDefault: boolean } {
  const sortDir: SortDir =
    field === current.sortBy ? (current.sortDir === "asc" ? "desc" : "asc") : "asc";
  return {
    sortBy: field,
    sortDir,
    isDefault: field === defaultField && sortDir === defaultDir,
  };
}

/**
 * Sortable-table state derived from the URL query params managed by
 * `useUrlQueryState` (Management List canonical pattern, 2026-08-18). The URL is
 * the single source of truth: `sortBy` / `sortDir` survive refresh and are the
 * same params the API and the `use-*-query` hooks already consume. Every sort
 * change also clears `page` so the user lands on page 1 of the new ordering.
 */
export function useTableSort(
  params: { sortBy?: string; sortDir?: string },
  setParams: (updates: Record<string, string | undefined>) => void,
  defaultField: string,
  defaultDir: SortDir = "desc",
): TableSort {
  const sortBy = params.sortBy ?? defaultField;
  const sortDir: SortDir =
    params.sortDir === "asc" ? "asc" : params.sortDir === "desc" ? "desc" : defaultDir;

  const onSort = useCallback(
    (field: string) => {
      const next = resolveNextSort({ sortBy, sortDir }, field, defaultField, defaultDir);
      setParams({
        sortBy: next.isDefault ? undefined : next.sortBy,
        sortDir: next.isDefault ? undefined : next.sortDir,
        page: undefined,
      });
    },
    [sortBy, sortDir, setParams, defaultField, defaultDir],
  );

  return { sortBy, sortDir, onSort };
}
