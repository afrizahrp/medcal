"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import type { DeviceCapabilityItemRow, DeviceCapabilityRow } from "../device-capabilities/device-capabilities-ui";
import type { DeviceTypeRow } from "../device-types/device-types-ui";
import type { UomRow } from "../uoms/uoms-ui";

export interface DeviceCalibrationParameterTypeRef {
  id: string;
  code: string;
  name: string;
}

export interface DeviceCalibrationParameterCapabilityRef {
  id: string;
  code: string;
  name: string;
}

export interface DeviceCalibrationParameterItemRef {
  id: string;
  code: string;
  name: string;
  capabilityId: string;
  capability: DeviceCalibrationParameterCapabilityRef;
}

export interface DeviceCalibrationParameterUomRef {
  id: string;
  code: string;
  name: string;
  symbol: string;
}

export interface DeviceCalibrationParameterRow {
  id: string;
  deviceTypeId: string;
  capabilityItemId: string;
  code: string;
  name: string;
  description: string | null;
  uomId: string;
  createdAt: string;
  updatedAt: string;
  deviceType: DeviceCalibrationParameterTypeRef;
  capabilityItem: DeviceCalibrationParameterItemRef;
  uom: DeviceCalibrationParameterUomRef;
}

export interface DeviceCalibrationParameterListResponse {
  data: DeviceCalibrationParameterRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const deviceCalibrationParameterFormPageClass =
  "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const deviceCalibrationParameterFormSurfaceClass = "mt-5 p-4 md:p-5";
export const deviceCalibrationParameterFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName };

export function DeviceCalibrationParameterFilters({
  searchInput,
  onSearchChange,
  deviceTypeId,
  onDeviceTypeChange,
  deviceTypes,
  capabilityId,
  onCapabilityChange,
  capabilities,
  capabilityItemId,
  onCapabilityItemChange,
  capabilityItems,
  uomId,
  onUomChange,
  uoms,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  deviceTypeId: string;
  onDeviceTypeChange: (value: string) => void;
  deviceTypes: DeviceTypeRow[];
  capabilityId: string;
  onCapabilityChange: (value: string) => void;
  capabilities: DeviceCapabilityRow[];
  capabilityItemId: string;
  onCapabilityItemChange: (value: string) => void;
  capabilityItems: DeviceCapabilityItemRow[];
  uomId: string;
  onUomChange: (value: string) => void;
  uoms: UomRow[];
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari kode, nama, tipe, item, atau UOM…"
          className="pl-9"
          aria-label="Cari Calibration Parameter"
        />
      </div>
      <select
        value={deviceTypeId}
        onChange={(e) => onDeviceTypeChange(e.target.value)}
        className={cn(selectClassName, "w-full lg:w-48")}
        aria-label="Filter device type"
      >
        <option value="">Semua tipe</option>
        {deviceTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        value={capabilityId}
        onChange={(e) => onCapabilityChange(e.target.value)}
        className={cn(selectClassName, "w-full lg:w-48")}
        aria-label="Filter capability"
      >
        <option value="">Semua capability</option>
        {capabilities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={capabilityItemId}
        onChange={(e) => onCapabilityItemChange(e.target.value)}
        className={cn(selectClassName, "w-full lg:w-48")}
        aria-label="Filter capability item"
        disabled={!capabilityId}
      >
        <option value="">Semua item</option>
        {capabilityItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        value={uomId}
        onChange={(e) => onUomChange(e.target.value)}
        className={cn(selectClassName, "w-full lg:w-40")}
        aria-label="Filter UOM"
      >
        <option value="">Semua UOM</option>
        {uoms.map((uom) => (
          <option key={uom.id} value={uom.id}>
            {uom.symbol}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DeviceCalibrationParameterTable({
  parameters,
}: {
  parameters: DeviceCalibrationParameterRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Device Type</th>
            <th className="px-4 py-3">Capability Item</th>
            <th className="px-4 py-3">Kode</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">UOM</th>
            <th className="px-4 py-3">Deskripsi</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {parameters.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Badge variant="secondary" className="font-medium text-slate-600">
                  {row.deviceType.name}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{row.capabilityItem.name}</p>
                <p className="text-xs text-slate-500">{row.capabilityItem.capability.name}</p>
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className="font-mono font-medium text-slate-600">
                  {row.code}
                </Badge>
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
              <td className="px-4 py-3">
                <span className="font-medium text-slate-700">{row.uom.symbol}</span>
                <span className="ml-1 text-xs text-slate-500">{row.uom.name}</span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {row.description ? (
                  <span className="line-clamp-2">{row.description}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Link href={`/device-calibration-parameters/${row.id}`}>
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

export function DeviceCalibrationParameterEmptyState({
  onClearFilters,
}: {
  onClearFilters?: () => void;
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        Belum ada Calibration Parameter yang cocok dengan filter.
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
