"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName, formatRelativeTime } from "../leads/leads-ui";
import { ConfirmDialog, DetailField } from "../calibration-requests/calibration-requests-ui";

export type QuotationStatus =
  | "DRAFT"
  | "SENT"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export type QuotationSource = "PORTAL" | "PHONE" | "WHATSAPP" | "OTHER";

export type MoneyValue = string | number;

export interface QuotationCustomer {
  id: string;
  name: string;
  number: string;
}

export interface QuotationRequestRef {
  id: string;
  number: string;
  status: string;
  customerId: string;
}

export interface QuotationTax {
  id: string;
  taxCode: string;
  taxRate: MoneyValue;
  description: string;
}

export interface QuotationItemDeviceType {
  id: string;
  code: string;
  name: string;
}

export interface QuotationItemRequestItem {
  id: string;
  deviceId: string;
  notes: string | null;
  deviceType: QuotationItemDeviceType;
}

export interface QuotationItem {
  id: string;
  requestItemId: string | null;
  deviceId: string | null;
  tariffId: string | null;
  description: string;
  qty: MoneyValue;
  unitPrice: MoneyValue;
  lineTotal: MoneyValue;
  requestItem: QuotationItemRequestItem | null;
  tariff: { id: string; code: string; name: string; unitPrice: MoneyValue; currency: string } | null;
  device: { id: string; brand: string | null; model: string | null; serialNumber: string | null } | null;
}

export interface QuotationRow {
  id: string;
  companyId: string;
  customerId: string;
  number: string;
  requestId: string;
  source: QuotationSource;
  status: QuotationStatus;
  validUntil: string | null;
  subtotal: MoneyValue;
  taxId: string | null;
  taxAmount: MoneyValue | null;
  totalAmount: MoneyValue;
  currency: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  customerApprovedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuotationItem[];
  customer: QuotationCustomer;
  request: QuotationRequestRef;
  tax: QuotationTax | null;
}

export interface QuotationListResponse {
  data: QuotationRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export const STATUS_OPTIONS: QuotationStatus[] = [
  "DRAFT",
  "SENT",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];

export const SOURCE_LABELS: Record<QuotationSource, string> = {
  PORTAL: "Portal",
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  OTHER: "Other",
};

export const SOURCE_OPTIONS: QuotationSource[] = ["PORTAL", "PHONE", "WHATSAPP", "OTHER"];

const STATUS_BADGE_CLASS: Record<QuotationStatus, string> = {
  DRAFT: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
  SENT: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
  APPROVED: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  REJECTED: "border-transparent bg-red-500 text-white hover:bg-red-500",
  EXPIRED: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  CANCELLED: "border-transparent bg-slate-400 text-white hover:bg-slate-400",
};

export const formPageClass = "mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8";
export const formSurfaceClass = "mt-5 p-5 md:p-6";
export const formActionsClass = "mt-4 flex justify-end gap-3 border-t border-slate-100 pt-4";

export { PageHeader, Surface, selectClassName, PaginationBar, ConfirmDialog, DetailField };

export function moneyNumber(value: MoneyValue | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatIdr(value: MoneyValue | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(moneyNumber(value));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatusBadge({ status }: { status: QuotationStatus }) {
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

export function QuotationFilters({
  searchInput,
  onSearchChange,
  status,
  onStatusChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: QuotationStatus | "";
  onStatusChange: (value: QuotationStatus | "") => void;
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
          aria-label="Cari quotation"
        />
      </div>
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as QuotationStatus | "")}
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

export function QuotationTable({ quotations }: { quotations: QuotationRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Nomor</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Requisition</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Valid Until</th>
            <th className="px-4 py-3">Tanggal</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {quotations.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.number}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{row.customer.name}</p>
                <p className="text-xs text-slate-400">{row.customer.number}</p>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.request.number}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {formatIdr(row.totalAmount)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3 text-sm text-slate-500">{formatDate(row.validUntil)}</td>
              <td className="px-4 py-3 text-sm text-slate-500">{formatRelativeTime(row.createdAt)}</td>
              <td className="px-4 py-3">
                <Link href={`/quotations/${row.id}`}>
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

export function QuotationEmptyState({
  onClearFilters,
}: {
  onClearFilters?: () => void;
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        {onClearFilters
          ? "Belum ada quotation yang cocok dengan filter."
          : "Belum ada quotation. Buat quotation dari Requisition."}
      </p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export function QuotationTotals({
  subtotal,
  taxAmount,
  tax,
  totalAmount,
  preview,
}: {
  subtotal: MoneyValue;
  taxAmount: MoneyValue | null;
  tax?: QuotationTax | null;
  totalAmount: MoneyValue;
  preview?: boolean;
}) {
  return (
    <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">
      {preview ? (
        <p className="text-xs text-slate-400">Perkiraan — total final dihitung backend.</p>
      ) : null}
      <div className="flex justify-between gap-4">
        <dt className="text-slate-500">Subtotal</dt>
        <dd className="font-medium text-slate-900">{formatIdr(subtotal)}</dd>
      </div>
      {tax || taxAmount != null ? (
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            Tax
            {tax ? (
              <span className="ml-1 text-xs text-slate-400">
                ({tax.taxCode}
                {moneyNumber(tax.taxRate) > 0
                  ? ` ${new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 2 }).format(moneyNumber(tax.taxRate))}`
                  : ""}
                )
              </span>
            ) : null}
          </dt>
          <dd className="font-medium text-slate-900">{formatIdr(taxAmount)}</dd>
        </div>
      ) : (
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Tax</dt>
          <dd className="text-slate-400">—</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t border-slate-100 pt-2">
        <dt className="font-semibold text-slate-900">Total</dt>
        <dd className="font-semibold text-slate-900">{formatIdr(totalAmount)}</dd>
      </div>
    </dl>
  );
}

export type QuotationFormItem = {
  requestItemId: string;
  description: string;
  qty: string;
  unitPrice: string;
  deviceLabel: string;
  deviceIdLabel: string;
};

export function itemsFromRequest(
  items: Array<{
    id: string;
    deviceId: string;
    deviceType: { name: string };
  }>,
): QuotationFormItem[] {
  return items.map((item) => ({
    requestItemId: item.id,
    description: item.deviceType.name,
    qty: "1",
    unitPrice: "",
    deviceLabel: item.deviceType.name,
    deviceIdLabel: item.deviceId,
  }));
}

export function itemsFromQuotation(quotation: QuotationRow): QuotationFormItem[] {
  return quotation.items.map((item) => ({
    requestItemId: item.requestItemId ?? "",
    description: item.description,
    qty: String(item.qty),
    unitPrice: String(item.unitPrice),
    deviceLabel: item.requestItem?.deviceType.name ?? item.description,
    deviceIdLabel: item.requestItem?.deviceId ?? "—",
  }));
}

export function previewTotals(items: QuotationFormItem[]): {
  subtotal: number;
  totalAmount: number;
} {
  const subtotal = items.reduce((sum, item) => {
    const qty = moneyNumber(item.qty || "1");
    const unitPrice = moneyNumber(item.unitPrice);
    return sum + qty * unitPrice;
  }, 0);
  return { subtotal, totalAmount: subtotal };
}

export function formatQuotationApiError(
  err: unknown,
  fallback: string,
): { message: string; quotationId?: string } {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    const quotationId =
      typeof err.data?.quotationId === "string" ? err.data.quotationId : undefined;
    const messages: Record<string, string> = {
      DUPLICATE_QUOTATION_FOR_REQUEST:
        "Quotation untuk requisition ini sudah ada.",
      CALIBRATION_REQUEST_NOT_FOUND: "Requisition tidak ditemukan.",
      INVALID_STATUS_FOR_QUOTATION:
        "Requisition belum dalam status yang bisa dibuatkan quotation.",
      QUOTATION_SCOPE_MISMATCH:
        "Item quotation harus mencakup seluruh item Requisition.",
      DUPLICATE_REQUEST_ITEM: "Item requisition tidak boleh diduplikasi pada quotation.",
      TARIFF_NOT_FOUND: "Satu atau lebih tariff tidak ditemukan.",
      DEVICE_NOT_FOUND: "Satu atau lebih device tidak ditemukan untuk customer ini.",
      TAX_NOT_FOUND: "Tax tidak ditemukan.",
      INVALID_STATUS_FOR_UPDATE: "Hanya quotation DRAFT yang dapat diedit.",
      INVALID_STATUS_FOR_SEND: "Hanya quotation DRAFT yang dapat dikirim.",
      INVALID_STATUS_FOR_APPROVE: "Hanya quotation SENT yang dapat di-approve.",
      INVALID_STATUS_FOR_REJECT: "Hanya quotation SENT yang dapat di-reject.",
      ALREADY_CANCELLED: "Quotation sudah dibatalkan.",
      CANNOT_CANCEL_APPROVED: "Quotation yang sudah di-approve tidak dapat dibatalkan.",
      QUOTATION_NOT_FOUND: "Quotation tidak ditemukan.",
    };
    if (code && messages[code]) {
      return { message: messages[code], quotationId };
    }
    if (typeof err.data?.message === "string") {
      return { message: err.data.message, quotationId };
    }
    return { message: err.message, quotationId };
  }
  return { message: fallback };
}
