"use client";

import Link from "next/link";
import { SortableTh } from "@/components/ui/sortable-th";
import type { TableSort } from "@/hooks/use-table-sort";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";

export interface DeviceCapabilityItemRow {
  id: string;
  capabilityId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCapabilityRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: DeviceCapabilityItemRow[];
}

export interface DeviceCapabilityListResponse {
  data: DeviceCapabilityRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const deviceCapabilityFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const deviceCapabilityFormSurfaceClass = "mt-5 p-4 md:p-5";
export const deviceCapabilityFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName };

export function DeviceCapabilityStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant={isActive ? "default" : "secondary"}
      className={cn(
        "font-medium",
        isActive
          ? "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
          : "text-slate-600",
      )}
    >
      {isActive ? "Aktif" : "Nonaktif"}
    </Badge>
  );
}

export function DeviceCapabilityFilters({
  searchInput,
  onSearchChange,
  isActive,
  onIsActiveChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  isActive: boolean | "";
  onIsActiveChange: (value: boolean | "") => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari kode atau nama…"
          className="pl-9"
          aria-label="Cari Device Capability"
        />
      </div>
      <select
        value={isActive === "" ? "" : isActive ? "true" : "false"}
        onChange={(e) => {
          const next = e.target.value;
          onIsActiveChange(next === "" ? "" : next === "true");
        }}
        className={cn(selectClassName, "w-full sm:w-44")}
        aria-label="Filter status"
      >
        <option value="">Semua status</option>
        <option value="true">Aktif</option>
        <option value="false">Nonaktif</option>
      </select>
    </div>
  );
}

export function DeviceCapabilityTable({
  capabilities,
  sort,
}: {
  capabilities: DeviceCapabilityRow[];
  sort: TableSort;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <SortableTh field="code" label="Kode" sort={sort} />
            <SortableTh field="name" label="Capability" sort={sort} />
            <th className="px-4 py-3 text-right">Items</th>
            <th className="px-4 py-3">Deskripsi</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {capabilities.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.code}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{row.name}</p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {row.itemCount ?? 0}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {row.description ? (
                  <span className="line-clamp-2">{row.description}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <DeviceCapabilityStatusBadge isActive={row.isActive} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/device-capabilities/${row.id}`}>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DeviceCapabilityEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        Belum ada Device Capability yang cocok dengan filter.
      </p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export { PaginationBar };
