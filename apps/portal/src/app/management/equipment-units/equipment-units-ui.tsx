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

export interface EquipmentUnitTypeRef {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

export interface EquipmentUnitRow {
  id: string;
  companyId: string;
  equipmentTypeId: string;
  code: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  equipmentType: EquipmentUnitTypeRef;
}

export interface EquipmentUnitListResponse {
  data: EquipmentUnitRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const equipmentUnitFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const equipmentUnitFormSurfaceClass = "mt-5 p-4 md:p-5";
export const equipmentUnitFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName, PaginationBar };

export function EquipmentUnitStatusBadge({ isActive }: { isActive: boolean }) {
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

export function EquipmentUnitFilters({
  searchInput,
  onSearchChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari kode, tipe, merek, model, atau no. seri…"
          className="pl-9"
          aria-label="Cari Equipment Unit"
        />
      </div>
    </div>
  );
}

export function EquipmentUnitTable({
  units,
  sort,
}: {
  units: EquipmentUnitRow[];
  sort: TableSort;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <SortableTh field="code" label="Kode" sort={sort} />
            <th className="px-4 py-3">Equipment Type</th>
            <th className="px-4 py-3">Merek</th>
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3">No. Seri</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {units.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs font-medium text-slate-800">{row.code}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.equipmentType.name}</td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {row.brand ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {row.model ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {row.serialNumber ?? <span className="font-sans text-slate-400">—</span>}
              </td>
              <td className="px-4 py-3">
                <EquipmentUnitStatusBadge isActive={row.isActive} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/equipment-units/${row.id}`}>
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

export function EquipmentUnitEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">Belum ada Equipment Unit yang cocok dengan filter.</p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}
