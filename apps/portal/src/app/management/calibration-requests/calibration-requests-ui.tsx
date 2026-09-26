"use client";

import { useMemo, useState } from "react";
import { SortableTh } from "@/components/ui/sortable-th";
import type { TableSort } from "@/hooks/use-table-sort";
import Link from "next/link";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName, formatRelativeTime } from "../leads/leads-ui";
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  type CalibrationRequestStatus,
} from "./calibration-request-status";

export type { CalibrationRequestStatus };
export { STATUS_LABELS, STATUS_OPTIONS };

export type ServiceMode = "ON_SITE" | "SEND_TO_LAB";

export interface CalibrationRequestDeviceType {
  id: string;
  code: string;
  name: string;
  category: { id: string; name: string };
}

export interface CalibrationRequestItem {
  id: string;
  deviceTypeId: string;
  /** Customer's original terminology for the equipment. */
  customerDeviceName: string | null;
  /** Customer-provided equipment model. */
  model: string | null;
  /**
   * Resolved Device.id (real FK) — the customer's Serial No is a lookup key
   * only; it is never stored here. Never display this raw value — use
   * `device.serialNumber` for display/edit pre-fill.
   */
  deviceId: string;
  /** The resolved Device's Serial No, for display and edit-form pre-fill. */
  device: { serialNumber: string | null } | null;
  /** Aggregate quantity of units for this line (>= 1). */
  qty: number;
  /**
   * Customer-declared AKD/AKL/NIE (Nomor Izin Edar). May be null — the customer
   * often does not know it at Requisition stage. Declaration only, never
   * technical verification.
   */
  akdAkl: string | null;
  /** Provenance of `akdAkl`. */
  akdAklDeclaration: AkdAklDeclarationValue;
  notes: string | null;
  deviceType: CalibrationRequestDeviceType;
}

export type AkdAklDeclarationValue =
  "NOT_PROVIDED" | "CUSTOMER_DECLARED_NONE" | "CUSTOMER_PROVIDED";

export const AKD_AKL_DECLARATION_OPTIONS: AkdAklDeclarationValue[] = [
  "NOT_PROVIDED",
  "CUSTOMER_DECLARED_NONE",
  "CUSTOMER_PROVIDED",
];

export const AKD_AKL_DECLARATION_LABELS: Record<AkdAklDeclarationValue, string> = {
  NOT_PROVIDED: "Belum diberikan customer",
  CUSTOMER_DECLARED_NONE: "Customer menyatakan tidak ada",
  CUSTOMER_PROVIDED: "Customer memberikan nomor",
};

export interface CalibrationRequestCustomer {
  id: string;
  name: string;
  number: string;
}

export interface CalibrationRequestRow {
  id: string;
  companyId: string;
  customerId: string;
  number: string;
  leadId: string | null;
  serviceMode: ServiceMode;
  /** The date expected/requested by the customer for calibration service. */
  expectedDate: string | null;
  status: CalibrationRequestStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: CalibrationRequestItem[];
  customer: CalibrationRequestCustomer;
}

export interface CalibrationRequestListResponse {
  data: CalibrationRequestRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const SERVICE_MODE_LABELS: Record<ServiceMode, string> = {
  ON_SITE: "On Site",
  // Business term is "In Lab" (internal enum stays SEND_TO_LAB). Drives the WOL
  // Work Order document identity.
  SEND_TO_LAB: "In Lab",
};

export const SERVICE_MODE_OPTIONS: ServiceMode[] = ["ON_SITE", "SEND_TO_LAB"];

const STATUS_BADGE_CLASS: Record<CalibrationRequestStatus, string> = {
  DRAFT: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
  SUBMITTED: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
  IN_QUOTATION: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  CANCELLED: "border-transparent bg-red-500 text-white hover:bg-red-500",
  FULFILLED: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
};

export const formPageClass = "mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8";
export const formSurfaceClass = "mt-5 p-5 md:p-6";
export const formActionsClass = "mt-4 flex justify-end gap-3 border-t border-slate-100 pt-4";

export { PageHeader, Surface, selectClassName, PaginationBar };

export function StatusBadge({ status }: { status: CalibrationRequestStatus }) {
  return (
    <Badge variant="status" className={cn(STATUS_BADGE_CLASS[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ServiceModeBadge({ mode }: { mode: ServiceMode }) {
  return (
    <Badge
      variant="outline"
      className="rounded-md border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600"
    >
      {SERVICE_MODE_LABELS[mode]}
    </Badge>
  );
}

export function CalibrationRequestFilters({
  searchInput,
  onSearchChange,
  status,
  onStatusChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: CalibrationRequestStatus | "";
  onStatusChange: (value: CalibrationRequestStatus | "") => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nomor atau customer…"
          className="pl-9"
          aria-label="Cari requisition"
        />
      </div>
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as CalibrationRequestStatus | "")}
        className={cn(selectClassName, "w-full sm:w-44")}
        aria-label="Filter status"
      >
        <option value="">Semua status</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CalibrationRequestTable({
  requests,
  sort,
}: {
  requests: CalibrationRequestRow[];
  sort: TableSort;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <SortableTh field="number" label="Nomor" sort={sort} />
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Mode</th>
            <th className="px-4 py-3">Items</th>
            <SortableTh field="status" label="Status" sort={sort} />
            <SortableTh field="createdAt" label="Tanggal" sort={sort} />
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.map((req) => (
            <tr key={req.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{req.number}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{req.customer.name}</p>
                <p className="text-xs text-slate-400">{req.customer.number}</p>
              </td>
              <td className="px-4 py-3">
                <ServiceModeBadge mode={req.serviceMode} />
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{req.items.length} item(s)</td>
              <td className="px-4 py-3">
                <StatusBadge status={req.status} />
              </td>
              <td className="px-4 py-3 text-sm text-slate-500">
                {formatRelativeTime(req.createdAt)}
              </td>
              <td className="px-4 py-3">
                <Link href={`/calibration-requests/${req.id}`}>
                  <Button variant="ghost" size="sm">
                    View
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

export function CalibrationRequestEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">Belum ada requisition yang cocok dengan filter.</p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  variant = "default",
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  variant?: "default" | "destructive";
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Batal
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Memproses…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export type CustomerOption = {
  id: string;
  name: string;
  number: string;
};

/**
 * Customer master-data picker — the Command + Popover pattern shared by
 * "+ Requisition" and "Import Excel". Fed by the existing `useCustomers` hook
 * (status: "ACTIVE"); never fetches on its own.
 */
export function CustomerCommandSelect({
  value,
  onChange,
  customers,
  loading,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  customers: CustomerOption[];
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((customer) => customer.id === value);

  return (
    <CommandPopover
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder="Cari customer…"
      emptyLabel={loading ? "Memuat…" : "Customer tidak ditemukan."}
      contentClassName="w-[400px] p-0"
      trigger={
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Customer"
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.name} <span className="text-slate-400">({selected.number})</span>
            </span>
          ) : (
            <span className="text-slate-400">{loading ? "Memuat…" : "Pilih customer…"}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      }
    >
      <CommandGroup>
        {customers.map((customer) => (
          <CommandItem
            key={customer.id}
            value={`${customer.name} ${customer.number}`}
            onSelect={() => {
              onChange(customer.id);
              setOpen(false);
            }}
          >
            <Check
              className={cn("mr-2 h-4 w-4", value === customer.id ? "opacity-100" : "opacity-0")}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{customer.name}</p>
              <p className="truncate text-xs text-slate-500">{customer.number}</p>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandPopover>
  );
}

export type DeviceTypeOption = {
  id: string;
  name: string;
  code?: string;
  category?: { id: string; name: string } | null;
};

export function DeviceTypeItemSelect({
  value,
  onChange,
  deviceTypes,
  loading,
  disabled,
  placeholder = "Select Device Name",
  ariaLabel = "Device Name",
  allowClear = false,
  clearLabel = "Semua Device Name",
}: {
  value: string;
  onChange: (id: string) => void;
  deviceTypes: DeviceTypeOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Adds a "clear" row that resets the value to "" (for list filters). */
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = deviceTypes.find((type) => type.id === value);
  const groups = useMemo(() => {
    const map = new Map<string, DeviceTypeOption[]>();
    for (const type of deviceTypes) {
      const heading = type.category?.name || "Other";
      const list = map.get(heading) ?? [];
      list.push(type);
      map.set(heading, list);
    }
    return map;
  }, [deviceTypes]);

  const emptyLabel =
    !loading && deviceTypes.length === 0
      ? "No device names available"
      : "Device Name tidak ditemukan.";

  return (
    <CommandPopover
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder="Cari device name…"
      emptyLabel={loading ? "Memuat…" : emptyLabel}
      trigger={
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-slate-400">{loading ? "Memuat tipe…" : placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      }
    >
      {allowClear ? (
        <CommandGroup>
          <CommandItem
            value={clearLabel}
            onSelect={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <Check className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")} />
            <span className="truncate text-slate-500">{clearLabel}</span>
          </CommandItem>
        </CommandGroup>
      ) : null}
      {Array.from(groups.entries()).map(([heading, types]) => (
        <CommandGroup key={heading} heading={heading}>
          {types.map((type) => (
            <CommandItem
              key={type.id}
              value={`${type.name} ${type.code ?? ""} ${heading}`}
              onSelect={() => {
                onChange(type.id);
                setOpen(false);
              }}
            >
              <Check
                className={cn("mr-2 h-4 w-4", value === type.id ? "opacity-100" : "opacity-0")}
              />
              <span className="truncate">{type.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </CommandPopover>
  );
}
