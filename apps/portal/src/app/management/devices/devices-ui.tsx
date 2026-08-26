"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import type { DeviceTypeRow } from "../device-types/device-types-ui";
import type { CustomerRow } from "../customers/customers-ui";

export type DeviceStatus = "ACTIVE" | "INACTIVE";

export interface DeviceTypeRef {
  id: string;
  code: string;
  name: string;
}

export interface DeviceCustomerRef {
  id: string;
  number: string;
  name: string;
}

export interface DeviceRow {
  id: string;
  companyId: string;
  customerId: string;
  deviceTypeId: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  category: string | null;
  locationText: string | null;
  status: DeviceStatus;
  createdAt: string;
  updatedAt: string;
  deviceType: DeviceTypeRef;
  customer: DeviceCustomerRef;
}

export interface DeviceListResponse {
  data: DeviceRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
};

export const DEVICE_STATUS_OPTIONS: DeviceStatus[] = ["ACTIVE", "INACTIVE"];

export const deviceFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const deviceFormSurfaceClass = "mt-5 p-4 md:p-5";
export const deviceFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName };

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <Badge
      variant={status === "ACTIVE" ? "default" : "secondary"}
      className={cn(
        "font-medium",
        status === "ACTIVE"
          ? "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
          : "text-slate-600",
      )}
    >
      {DEVICE_STATUS_LABELS[status]}
    </Badge>
  );
}

function DeviceTypeFilter({
  deviceTypeId,
  onDeviceTypeChange,
  deviceTypes,
}: {
  deviceTypeId: string;
  onDeviceTypeChange: (value: string) => void;
  deviceTypes: DeviceTypeRow[];
}) {
  const [open, setOpen] = useState(false);
  const selected = deviceTypes.find((t) => t.id === deviceTypeId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Filter device type"
          className="w-full justify-between font-normal sm:w-64"
        >
          <span className="truncate">{selected ? selected.name : "Semua tipe"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Cari device type…" />
          <CommandList>
            <CommandEmpty>Device Type tidak ditemukan.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Semua tipe"
                onSelect={() => {
                  onDeviceTypeChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", deviceTypeId === "" ? "opacity-100" : "opacity-0")}
                />
                <span className="truncate">Semua tipe</span>
              </CommandItem>
              {deviceTypes.map((deviceType) => (
                <CommandItem
                  key={deviceType.id}
                  value={`${deviceType.name} ${deviceType.code}`}
                  onSelect={() => {
                    onDeviceTypeChange(deviceType.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      deviceTypeId === deviceType.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{deviceType.name}</p>
                    <p className="truncate font-mono text-xs text-slate-500">{deviceType.code}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DeviceFilters({
  searchInput,
  onSearchChange,
  deviceTypeId,
  onDeviceTypeChange,
  deviceTypes,
  customerId,
  onCustomerChange,
  customers,
  status,
  onStatusChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  deviceTypeId: string;
  onDeviceTypeChange: (value: string) => void;
  deviceTypes: DeviceTypeRow[];
  customerId: string;
  onCustomerChange: (value: string) => void;
  customers: CustomerRow[];
  status: DeviceStatus | "";
  onStatusChange: (value: DeviceStatus | "") => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari brand, model, serial number, tipe, atau customer…"
          className="pl-9"
          aria-label="Cari Device"
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <DeviceTypeFilter
          deviceTypeId={deviceTypeId}
          onDeviceTypeChange={onDeviceTypeChange}
          deviceTypes={deviceTypes}
        />
        <select
          value={customerId}
          onChange={(e) => onCustomerChange(e.target.value)}
          className={cn(selectClassName, "w-full sm:min-w-56 sm:flex-1")}
          aria-label="Filter customer"
        >
          <option value="">Semua customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as DeviceStatus | "")}
          className={cn(selectClassName, "w-full sm:w-44")}
          aria-label="Filter status"
        >
          <option value="">Semua status</option>
          {DEVICE_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {DEVICE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function DeviceTable({ devices }: { devices: DeviceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Device Type</th>
            <th className="px-4 py-3">Brand</th>
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3">Serial Number</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {devices.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Badge variant="secondary" className="font-medium text-slate-600">
                  {row.deviceType.name}
                </Badge>
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{row.brand || "—"}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{row.model || "—"}</td>
              <td className="px-4 py-3 font-mono text-sm text-slate-700">
                {row.serialNumber || "—"}
              </td>
              <td className="px-4 py-3 text-slate-700">{row.customer.name}</td>
              <td className="px-4 py-3">
                <DeviceStatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/devices/${row.id}`}>
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

export function DeviceEmptyState({
  onClearFilters,
  createHref,
}: {
  onClearFilters?: () => void;
  createHref?: string;
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        {onClearFilters ? "Belum ada Device yang cocok dengan filter." : "Belum ada Device."}
      </p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : createHref ? (
        <Button asChild className="mt-3">
          <Link href={createHref}>
            <Plus className="h-4 w-4" /> Device
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

export { PaginationBar };
