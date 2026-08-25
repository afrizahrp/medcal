"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";

export type UomCategory =
  | "PRESSURE"
  | "TEMPERATURE"
  | "RATE"
  | "FLOW"
  | "PERCENTAGE"
  | "LENGTH"
  | "MASS"
  | "VOLUME"
  | "TIME"
  | "ELECTRICAL"
  | "OTHER";

export interface UomRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  category: UomCategory;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UomListResponse {
  data: UomRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const UOM_CATEGORY_LABELS: Record<UomCategory, string> = {
  PRESSURE: "Tekanan",
  TEMPERATURE: "Suhu",
  RATE: "Laju",
  FLOW: "Aliran",
  PERCENTAGE: "Persentase",
  LENGTH: "Panjang",
  MASS: "Massa",
  VOLUME: "Volume",
  TIME: "Waktu",
  ELECTRICAL: "Elektrik",
  OTHER: "Lainnya",
};

export const UOM_CATEGORY_OPTIONS: UomCategory[] = [
  "PRESSURE",
  "TEMPERATURE",
  "RATE",
  "FLOW",
  "PERCENTAGE",
  "LENGTH",
  "MASS",
  "VOLUME",
  "TIME",
  "ELECTRICAL",
  "OTHER",
];

export const uomFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const uomFormSurfaceClass = "mt-5 p-4 md:p-5";
export const uomFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName };

export function UomCategoryBadge({ category }: { category: UomCategory }) {
  return (
    <Badge variant="secondary" className="font-medium text-slate-600">
      {UOM_CATEGORY_LABELS[category]}
    </Badge>
  );
}

export function UomStatusBadge({ isActive }: { isActive: boolean }) {
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

export function UomFilters({
  searchInput,
  onSearchChange,
  category,
  onCategoryChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  category: UomCategory | "";
  onCategoryChange: (value: UomCategory | "") => void;
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
          aria-label="Cari UOM"
        />
      </div>
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value as UomCategory | "")}
        className={cn(selectClassName, "w-full sm:w-44")}
        aria-label="Filter kategori"
      >
        <option value="">Semua kategori</option>
        {UOM_CATEGORY_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {UOM_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function UomTable({ uoms }: { uoms: UomRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Kode</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Simbol</th>
            <th className="px-4 py-3">Kategori</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {uoms.map((uom) => (
            <tr key={uom.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{uom.code}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{uom.name}</p>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{uom.symbol}</td>
              <td className="px-4 py-3">
                <UomCategoryBadge category={uom.category} />
              </td>
              <td className="px-4 py-3">
                <UomStatusBadge isActive={uom.isActive} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/uoms/${uom.id}`}>
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

export function UomEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">Belum ada UOM yang cocok dengan filter.</p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export { PaginationBar };
