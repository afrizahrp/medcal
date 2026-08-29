"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";

export interface EquipmentTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentTypeListResponse {
  data: EquipmentTypeRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const equipmentTypeFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const equipmentTypeFormSurfaceClass = "mt-5 p-4 md:p-5";
export const equipmentTypeFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName, PaginationBar };

export function EquipmentTypeStatusBadge({ isActive }: { isActive: boolean }) {
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

export function EquipmentTypeFilters({
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
          placeholder="Cari kode, nama, atau kategori…"
          className="pl-9"
          aria-label="Cari Equipment Type"
        />
      </div>
    </div>
  );
}

export function EquipmentTypeTable({ types }: { types: EquipmentTypeRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Kode</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Kategori</th>
            <th className="px-4 py-3">Deskripsi</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {types.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.code}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{row.name}</p>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {row.category ? row.category : <span className="text-slate-400">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {row.description ? (
                  <span className="line-clamp-2">{row.description}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <EquipmentTypeStatusBadge isActive={row.isActive} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/equipment-types/${row.id}`}>
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

export function EquipmentTypeEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">Belum ada Equipment Type yang cocok dengan filter.</p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}
