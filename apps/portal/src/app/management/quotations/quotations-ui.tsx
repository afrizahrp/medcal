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

export interface QuotationCustomerContact {
  id?: string;
  name: string;
  isPrimary: boolean;
}

export interface QuotationCustomer {
  id: string;
  name: string;
  number: string;
  email: string | null;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  contacts?: QuotationCustomerContact[];
}

export interface QuotationRequestRef {
  id: string;
  number: string;
  status: string;
  customerId: string;
}

export interface TaxOption {
  taxCode: string;
  taxRate: MoneyValue;
  description: string;
  isExclude: boolean;
  isActive: boolean;
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
  discountAmount: MoneyValue;
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
  headerDiscountAmount: MoneyValue;
  taxCode: string | null;
  taxRate: MoneyValue | null;
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

/** Qty is a whole unit count — never a decimal. */
export function formatQty(value: MoneyValue | null | undefined): string {
  return String(Math.trunc(moneyNumber(value)));
}

export function isPositiveIntegerQty(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0;
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
  headerDiscountAmount,
  headerDiscountInput,
  onHeaderDiscountChange,
  taxCode,
  taxRate,
  taxAmount,
  totalAmount,
}: {
  subtotal: MoneyValue;
  headerDiscountAmount?: MoneyValue | null;
  headerDiscountInput?: string;
  onHeaderDiscountChange?: (value: string) => void;
  taxCode?: string | null;
  taxRate?: MoneyValue | null;
  taxAmount: MoneyValue | null;
  totalAmount: MoneyValue;
}) {
  return (
    <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-slate-500">Subtotal</dt>
        <dd className="font-medium text-slate-900">{formatIdr(subtotal)}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-slate-500">Header Discount</dt>
        <dd>
          {onHeaderDiscountChange ? (
            <Input
              type="number"
              min="0"
              step="1"
              value={headerDiscountInput ?? ""}
              onChange={(e) => onHeaderDiscountChange(e.target.value)}
              className="h-8 w-32 text-right"
              aria-label="Header discount"
            />
          ) : (
            <span className="font-medium text-slate-900">{formatIdr(headerDiscountAmount)}</span>
          )}
        </dd>
      </div>
      {taxCode || taxAmount != null ? (
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            Tax
            {taxCode ? (
              <span className="ml-1 text-xs text-slate-400">
                ({taxCode}
                {moneyNumber(taxRate) > 0
                  ? ` ${new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 2 }).format(moneyNumber(taxRate))}`
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
  discountAmount: string;
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
    discountAmount: "0",
    deviceLabel: item.deviceType.name,
    deviceIdLabel: item.deviceId,
  }));
}

export function itemsFromQuotation(quotation: QuotationRow): QuotationFormItem[] {
  return quotation.items.map((item) => ({
    requestItemId: item.requestItemId ?? "",
    description: item.description,
    qty: formatQty(item.qty),
    unitPrice: String(item.unitPrice),
    discountAmount: String(item.discountAmount ?? 0),
    deviceLabel: item.requestItem?.deviceType.name ?? item.description,
    deviceIdLabel: item.requestItem?.deviceId ?? "—",
  }));
}

export function previewTotals(
  items: QuotationFormItem[],
  tax?: Pick<TaxOption, "taxRate" | "isExclude"> | null,
  headerDiscountAmount?: MoneyValue | null,
): {
  subtotal: number;
  headerDiscountAmount: number;
  taxAmount: number | null;
  totalAmount: number;
} {
  const subtotal = items.reduce((sum, item) => {
    const qty = moneyNumber(item.qty || "1");
    const unitPrice = moneyNumber(item.unitPrice);
    const discount = moneyNumber(item.discountAmount);
    return sum + (qty * unitPrice - discount);
  }, 0);
  const headerDiscount = moneyNumber(headerDiscountAmount);
  const netAmount = subtotal - headerDiscount;
  if (!tax) {
    return { subtotal, headerDiscountAmount: headerDiscount, taxAmount: null, totalAmount: netAmount };
  }
  const rate = moneyNumber(tax.taxRate);
  if (rate === 0) {
    return { subtotal, headerDiscountAmount: headerDiscount, taxAmount: 0, totalAmount: netAmount };
  }
  if (tax.isExclude) {
    const taxAmount = netAmount * rate;
    return {
      subtotal,
      headerDiscountAmount: headerDiscount,
      taxAmount,
      totalAmount: netAmount + taxAmount,
    };
  }
  const taxAmount = (netAmount * rate) / (1 + rate);
  return { subtotal, headerDiscountAmount: headerDiscount, taxAmount, totalAmount: netAmount };
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
      INVALID_ITEM_DISCOUNT: "Diskon item tidak boleh negatif.",
      ITEM_DISCOUNT_EXCEEDS_GROSS: "Diskon item tidak boleh melebihi jumlah bruto item.",
      INVALID_HEADER_DISCOUNT: "Header discount tidak boleh negatif.",
      HEADER_DISCOUNT_EXCEEDS_SUBTOTAL: "Header discount tidak boleh melebihi subtotal.",
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

export function customerContactAddressee(customer: QuotationCustomer): string {
  const contacts = customer.contacts ?? [];
  const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0];
  const name = primary?.name?.trim();
  if (!name) return "Bapak/Ibu";
  return `Bapak/Ibu ${name}`;
}

export function customerRegisteredEmail(customer: QuotationCustomer): string | null {
  const email = customer.email?.trim();
  return email || null;
}

export function quotationPdfFilename(input: {
  number: string;
  companyId: string;
  issuedAt: Date | string;
}): string {
  const companyId = input.companyId.trim().toUpperCase() || "PKM";
  const issuedAt = input.issuedAt instanceof Date ? input.issuedAt : new Date(input.issuedAt);
  const match = input.number.trim().match(/^([A-Z]{3})\/(\d{4})\/(\d{2})\/(\d{5})$/);
  if (match && !Number.isNaN(issuedAt.getTime())) {
    const prefix = match[1];
    const sequence = match[4];
    const yyyy = String(issuedAt.getUTCFullYear());
    const mm = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(issuedAt.getUTCDate()).padStart(2, "0");
    return `${companyId}-${prefix}-${yyyy}${mm}${dd}-${sequence}.pdf`;
  }

  const fallback = input.number.replace(/[/\\]+/g, "-");
  return `${companyId}-${fallback}.pdf`;
}

export function quotationPdfFilenameForRow(
  quotation: Pick<QuotationRow, "number" | "companyId" | "createdAt">,
): string {
  return quotationPdfFilename({
    number: quotation.number,
    companyId: quotation.companyId,
    issuedAt: quotation.createdAt,
  });
}

export function quotationComposeHref(quotation: QuotationRow, to: string): string {
  const qs = new URLSearchParams({
    to,
    subject: `Quotation ${quotation.number} — ${quotation.customer.name}`,
    body: [
      `Yth. ${customerContactAddressee(quotation.customer)},`,
      "",
      `Terlampir quotation ${quotation.number} untuk Calibration Request ${quotation.request.number}.`,
      `Total: ${formatIdr(quotation.totalAmount)}.`,
      quotation.validUntil ? `Berlaku hingga: ${formatDate(quotation.validUntil)}.` : "",
      "",
      "Hormat kami.",
    ]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n")
      .trim(),
    quotationId: quotation.id,
  });
  return `/email/compose?${qs.toString()}`;
}
