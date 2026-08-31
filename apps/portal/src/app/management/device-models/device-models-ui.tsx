"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import type { DeviceTypeRow } from "../device-types/device-types-ui";

export interface DeviceModelTypeRef {
  id: string;
  code: string;
  name: string;
}

export interface DeviceModelRow {
  id: string;
  deviceTypeId: string;
  manufacturer: string;
  model: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deviceType: DeviceModelTypeRef;
}

export interface DeviceModelListResponse {
  data: DeviceModelRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const deviceModelFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const deviceModelFormSurfaceClass = "mt-5 p-4 md:p-5";
export const deviceModelFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName };

export function DeviceModelStatusBadge({ isActive }: { isActive: boolean }) {
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

export function DeviceModelFilters({
  searchInput,
  onSearchChange,
  deviceTypeId,
  onDeviceTypeChange,
  deviceTypes,
  isActive,
  onIsActiveChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  deviceTypeId: string;
  onDeviceTypeChange: (value: string) => void;
  deviceTypes: DeviceTypeRow[];
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
          placeholder="Cari manufacturer, model, atau device name…"
          className="pl-9"
          aria-label="Cari Device Model"
        />
      </div>
      <select
        value={deviceTypeId}
        onChange={(e) => onDeviceTypeChange(e.target.value)}
        className={cn(selectClassName, "w-full sm:w-56")}
        aria-label="Filter device name"
      >
        <option value="">Semua device name</option>
        {deviceTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
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

export function DeviceModelTable({ models }: { models: DeviceModelRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Device Name</th>
            <th className="px-4 py-3">Manufacturer</th>
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3">Deskripsi</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {models.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Badge variant="secondary" className="font-medium text-slate-600">
                  {row.deviceType.name}
                </Badge>
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{row.manufacturer}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{row.model}</p>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {row.description ? (
                  <span className="line-clamp-2">{row.description}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <DeviceModelStatusBadge isActive={row.isActive} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/device-models/${row.id}`}>
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

export function DeviceModelEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">Belum ada Device Model yang cocok dengan filter.</p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export { PaginationBar };
