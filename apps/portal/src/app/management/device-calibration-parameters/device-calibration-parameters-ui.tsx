"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
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
  valueType: "NUMBER" | "RATIO" | "TEXT" | "BOOLEAN";
  uomId: string | null;
  toleranceMin: string | number | null;
  toleranceMax: string | number | null;
  toleranceNote: string | null;
  createdAt: string;
  updatedAt: string;
  deviceType: DeviceCalibrationParameterTypeRef;
  capabilityItem: DeviceCalibrationParameterItemRef;
  uom: DeviceCalibrationParameterUomRef | null;
}

function formatBound(value: string | number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    useGrouping: false,
  }).format(Number(value));
}

export function formatCalibrationTolerance(row: {
  toleranceMin: string | number | null;
  toleranceMax: string | number | null;
  toleranceNote: string | null;
}): string | null {
  const min = row.toleranceMin == null || row.toleranceMin === "" ? null : Number(row.toleranceMin);
  const max = row.toleranceMax == null || row.toleranceMax === "" ? null : Number(row.toleranceMax);
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  let bounds: string | null = null;
  if (hasMin && hasMax) bounds = `${formatBound(min)} – ${formatBound(max)}`;
  else if (hasMax) bounds = `≤ ${formatBound(max)}`;
  else if (hasMin) bounds = `≥ ${formatBound(min)}`;
  const note = row.toleranceNote?.trim() || null;
  if (bounds && note) return `${bounds} (${note})`;
  return bounds ?? note;
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

function FilterCombobox({
  value,
  onChange,
  items,
  allLabel,
  searchPlaceholder,
  emptyLabel,
  ariaLabel,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Array<{ id: string; label: string; searchValue: string; hint?: string }>;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((item) => item.id === value);

  return (
    <CommandPopover
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder={searchPlaceholder}
      emptyLabel={emptyLabel}
      trigger={
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("w-full justify-between font-normal lg:w-48", className)}
        >
          <span className={cn("truncate", !selected && "text-slate-500")}>
            {selected ? selected.label : allLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      }
    >
      <CommandGroup>
        <CommandItem
          value={allLabel}
          onSelect={() => {
            onChange("");
            setOpen(false);
          }}
        >
          <Check className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")} />
          <span className="truncate">{allLabel}</span>
        </CommandItem>
        {items.map((item) => (
          <CommandItem
            key={item.id}
            value={item.searchValue}
            onSelect={() => {
              onChange(item.id);
              setOpen(false);
            }}
          >
            <Check
              className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.label}</p>
              {item.hint ? (
                <p className="truncate font-mono text-xs text-slate-500">{item.hint}</p>
              ) : null}
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandPopover>
  );
}

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
      <FilterCombobox
        value={deviceTypeId}
        onChange={onDeviceTypeChange}
        allLabel="Semua tipe"
        searchPlaceholder="Cari device type…"
        emptyLabel="Device Type tidak ditemukan."
        ariaLabel="Filter device type"
        items={deviceTypes.map((deviceType) => ({
          id: deviceType.id,
          label: deviceType.name,
          searchValue: `${deviceType.name} ${deviceType.code}`,
          hint: deviceType.code,
        }))}
      />
      <FilterCombobox
        value={capabilityId}
        onChange={onCapabilityChange}
        allLabel="Semua capability"
        searchPlaceholder="Cari capability…"
        emptyLabel="Capability tidak ditemukan."
        ariaLabel="Filter capability"
        items={capabilities.map((capability) => ({
          id: capability.id,
          label: capability.name,
          searchValue: `${capability.name} ${capability.code}`,
          hint: capability.code,
        }))}
      />
      <FilterCombobox
        value={capabilityItemId}
        onChange={onCapabilityItemChange}
        allLabel="Semua item"
        searchPlaceholder="Cari capability item…"
        emptyLabel="Capability Item tidak ditemukan."
        ariaLabel="Filter capability item"
        disabled={!capabilityId}
        items={capabilityItems.map((item) => ({
          id: item.id,
          label: item.name,
          searchValue: `${item.name} ${item.code}`,
          hint: item.code,
        }))}
      />
      <FilterCombobox
        value={uomId}
        onChange={onUomChange}
        allLabel="Semua UOM"
        searchPlaceholder="Cari UOM…"
        emptyLabel="UOM tidak ditemukan."
        ariaLabel="Filter UOM"
        className="lg:w-40"
        items={uoms.map((uom) => ({
          id: uom.id,
          label: uom.symbol,
          searchValue: `${uom.symbol} ${uom.name} ${uom.code}`,
          hint: uom.name,
        }))}
      />
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
      <table className="w-full min-w-[1140px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Device Type</th>
            <th className="px-4 py-3">Capability Item</th>
            <th className="px-4 py-3">Kode</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Tipe nilai</th>
            <th className="px-4 py-3">UOM</th>
            <th className="px-4 py-3">Batas</th>
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
                <Badge variant="secondary" className="font-mono text-xs text-slate-600">
                  {row.valueType}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {row.uom ? (
                  <>
                    <span className="font-medium text-slate-700">{row.uom.symbol}</span>
                    <span className="ml-1 text-xs text-slate-500">{row.uom.name}</span>
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 font-medium text-slate-700">
                {formatCalibrationTolerance(row) ?? (
                  <span className="font-normal text-slate-400">—</span>
                )}
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
