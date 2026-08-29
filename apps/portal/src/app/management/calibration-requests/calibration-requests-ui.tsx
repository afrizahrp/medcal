"use client";

import { useMemo, useState } from "react";
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
  deviceId: string;
  notes: string | null;
  deviceType: CalibrationRequestDeviceType;
}

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
  SEND_TO_LAB: "Send to Lab",
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
    <Badge
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        STATUS_BADGE_CLASS[status],
      )}
    >
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
}: {
  requests: CalibrationRequestRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Nomor</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Mode</th>
            <th className="px-4 py-3">Items</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Tanggal</th>
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

export function CalibrationRequestEmptyState({
  onClearFilters,
}: {
  onClearFilters?: () => void;
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        Belum ada requisition yang cocok dengan filter.
      </p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
}: {
  value: string;
  onChange: (id: string) => void;
  deviceTypes: DeviceTypeOption[];
  loading?: boolean;
  disabled?: boolean;
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
      ? "No device types available"
      : "Device Type tidak ditemukan.";

  return (
    <CommandPopover
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder="Cari device type…"
      emptyLabel={loading ? "Memuat…" : emptyLabel}
      trigger={
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Device Type"
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-slate-400">
              {loading ? "Memuat tipe…" : "Select Device Type"}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      }
    >
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
