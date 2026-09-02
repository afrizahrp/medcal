"use client";

import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir, TableSort } from "@/hooks/use-table-sort";

/**
 * A `<th>` whose label is a button that drives server-side sorting through
 * `useTableSort` (Management List canonical pattern). Shows a neutral
 * up/down glyph when inactive and a directional chevron when it is the active
 * sort, and sets `aria-sort` so assistive tech announces the state. Columns
 * that are not in the endpoint's `*_SORTABLE_FIELDS` allowlist should stay a
 * plain `<th>` — they must not look sortable (task §9).
 */
export function SortableTh({
  field,
  label,
  sort,
  align = "left",
  className,
}: {
  field: string;
  label: React.ReactNode;
  sort: Pick<TableSort, "sortBy" | "sortDir" | "onSort">;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.sortBy === field;
  const dir: SortDir = sort.sortDir;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;

  return (
    <th
      className={cn("px-4 py-3", className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => sort.onSort(field)}
        className={cn(
          "group inline-flex items-center gap-1 font-medium uppercase tracking-wider transition-colors hover:text-slate-700",
          align === "right" && "flex-row-reverse",
          active ? "text-slate-900" : "text-slate-500",
        )}
      >
        <span>{label}</span>
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", !active && "opacity-40 group-hover:opacity-70")}
          aria-hidden
        />
      </button>
    </th>
  );
}
