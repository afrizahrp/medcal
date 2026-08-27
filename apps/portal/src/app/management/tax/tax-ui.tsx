"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";

export type MoneyValue = string | number;

export interface TaxRow {
  id: string;
  companyId: string;
  taxCode: string;
  taxRate: MoneyValue;
  description: string;
  isActive: boolean;
  isExclude: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaxListResponse {
  data: TaxRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const taxFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const taxFormSurfaceClass = "mt-5 p-4 md:p-5";
export const taxFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName };

export function moneyNumber(value: MoneyValue): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatTaxRate(rate: MoneyValue): string {
  return new Intl.NumberFormat("id-ID", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(moneyNumber(rate));
}

export function TaxStatusBadge({ isActive }: { isActive: boolean }) {
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

export function TaxExcludeBadge({ isExclude }: { isExclude: boolean }) {
  return (
    <Badge variant="secondary" className="font-medium text-slate-600">
      {isExclude ? "Exclude" : "Include"}
    </Badge>
  );
}

export function TaxFilters({
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
          placeholder="Cari kode atau deskripsi…"
          className="pl-9"
          aria-label="Cari tax"
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

export function TaxTable({ taxes }: { taxes: TaxRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Kode</th>
            <th className="px-4 py-3">Deskripsi</th>
            <th className="px-4 py-3">Tarif</th>
            <th className="px-4 py-3">Perlakuan</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {taxes.map((tax) => (
            <tr key={tax.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{tax.taxCode}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{tax.description}</p>
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">{formatTaxRate(tax.taxRate)}</td>
              <td className="px-4 py-3">
                <TaxExcludeBadge isExclude={tax.isExclude} />
              </td>
              <td className="px-4 py-3">
                <TaxStatusBadge isActive={tax.isActive} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/tax/${tax.id}`}>
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

export function TaxEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">Belum ada tax yang cocok dengan filter.</p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export { PaginationBar };
