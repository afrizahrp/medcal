"use client";

import Link from "next/link";
import { SortableTh } from "@/components/ui/sortable-th";
import type { TableSort } from "@/hooks/use-table-sort";
import { Search } from "lucide-react";
import {
  ApiError,
  additionalLineTotal,
  describeAdditionalCalculation,
  formatIdr,
  resolveHeaderDiscount,
  roundMoney,
} from "@medcal/shared";
import type { DiscountInputMode, HeaderDiscountErrorCode } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import { ConfirmDialog, DetailField } from "../calibration-requests/calibration-requests-ui";
import { shouldShowTaxLine } from "./quotation-tax-display";
import { deviceDisplayNames } from "@/lib/device-name-display";

export type QuotationStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED";

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
  serviceMode?: "ON_SITE" | "SEND_TO_LAB";
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
  /** Customer's own wording for the device — displayed above the master name (MoM #3). */
  customerDeviceName: string | null;
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
  tariff: {
    id: string;
    code: string;
    name: string;
    unitPrice: MoneyValue;
    currency: string;
  } | null;
  device: {
    id: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
  } | null;
}

/**
 * Commercial additional item (e.g. ON_SITE accommodation): a SNAPSHOT line owned
 * by the quotation. Not a QuotationItem — it never reaches PO items, allocation,
 * work orders or calibration jobs.
 */
export interface QuotationAdditionalItem {
  id: string;
  additionalItemTypeId: string;
  code: string;
  description: string;
  unitLabel: string;
  qty: MoneyValue;
  /** Optional second multiplier (e.g. days) and its label; null for a simple qty line. */
  multiplier: MoneyValue | null;
  multiplierLabel: string | null;
  unitPrice: MoneyValue;
  lineTotal: MoneyValue;
  notes: string | null;
}

export type { DiscountInputMode };

export interface QuotationRow {
  id: string;
  companyId: string;
  customerId: string;
  number: string;
  requestId: string;
  source: QuotationSource;
  status: QuotationStatus;
  /** Business date (date-only, `YYYY-MM-DD…`). `createdAt` is the separate system timestamp. */
  quotationDate: string;
  validUntil: string | null;
  /** Free-text remarks on the quotation (printed on the PDF). */
  notes: string | null;
  subtotal: MoneyValue;
  headerDiscountAmount: MoneyValue;
  headerDiscountPercent: MoneyValue;
  headerDiscountInputMode: DiscountInputMode;
  taxCode: string;
  taxRate: MoneyValue;
  taxAmount: MoneyValue;
  totalAmount: MoneyValue;
  currency: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  /** Approver resolved from `approvedByUserId`; `name` may be null, hence the email fallback. */
  approvedBy: { id: string; name: string | null; email: string } | null;
  customerApprovedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuotationItem[];
  additionalItems: QuotationAdditionalItem[];
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

// Rupiah display formatting lives in @medcal/shared (formatIdr) so every
// surface renders the same amount identically. Re-exported here because many
// quotation/purchase-order modules import it from this file.
export { formatIdr };

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Date-only business values (quotation date) arrive as UTC midnight; format in
 * UTC so the viewer's time zone can never shift the calendar day.
 */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today's calendar day in the business zone (Asia/Jakarta) as `YYYY-MM-DD`. */
export function todayIsoJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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
    <Badge variant="status" className={cn(STATUS_BADGE_CLASS[status])}>
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

export function QuotationTable({
  quotations,
  sort,
}: {
  quotations: QuotationRow[];
  sort: TableSort;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <SortableTh field="number" label="Nomor" sort={sort} />
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Requisition</th>
            <th className="px-4 py-3">Total</th>
            <SortableTh field="status" label="Status" sort={sort} />
            <th className="px-4 py-3">Valid Until</th>
            <SortableTh field="quotationDate" label="Tanggal" sort={sort} />
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
              <td className="px-4 py-3 text-sm text-slate-500">
                {formatDateOnly(row.quotationDate)}
              </td>
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

export function QuotationEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
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

/**
 * Two-field header-discount editor. The field the user last typed in is the
 * source (`mode`); the other shows the value derived from the subtotal. The
 * parent owns `{mode, value}` and passes the DERIVED text for the non-source
 * field, so the pair on screen is always consistent.
 */
export interface DiscountEditor {
  mode: DiscountInputMode;
  percentText: string;
  amountText: string;
  onPercentChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  error?: string | null;
}

/** One additional cost as shown in the totals block: its name, how it was calculated, its amount. */
export interface AdditionalTotalsLine {
  key: string;
  description: string;
  /** e.g. "Rp100.000 × 3 orang × 2 hari". */
  calculation: string;
  amount: MoneyValue;
}

/**
 * Lines for the totals block, from the quotation's / PO's own snapshot fields (or
 * the live form rows) — never from the catalog. `amount` is the stored lineTotal
 * when present, otherwise the same unitPrice x qty x (multiplier ?? 1) the server
 * computes (form preview only).
 */
export function additionalTotalsLines(
  items: Array<{
    id?: string;
    key?: string;
    description: string;
    unitLabel: string;
    qty: MoneyValue;
    multiplier?: MoneyValue | null;
    multiplierLabel?: string | null;
    unitPrice: MoneyValue;
    lineTotal?: MoneyValue;
  }>,
): AdditionalTotalsLine[] {
  return items.map((item, index) => ({
    key: item.id ?? item.key ?? String(index),
    description: item.description,
    calculation: describeAdditionalCalculation(formatIdr(item.unitPrice), {
      qty: moneyNumber(item.qty),
      unitLabel: item.unitLabel,
      multiplier: item.multiplier == null || item.multiplier === "" ? null : moneyNumber(item.multiplier),
      multiplierLabel: item.multiplierLabel,
    }),
    amount:
      item.lineTotal ??
      additionalLineTotal(
        moneyNumber(item.unitPrice),
        moneyNumber(item.qty),
        item.multiplier == null || item.multiplier === "" ? null : moneyNumber(item.multiplier),
      ),
  }));
}

export function QuotationTotals({
  subtotal,
  additionalLines,
  headerDiscountAmount,
  headerDiscountPercent,
  discountEditor,
  taxCode,
  taxRate,
  taxAmount,
  taxIsExclude,
  totalAmount,
}: {
  subtotal: MoneyValue;
  /**
   * The additional (non-calibration) items inside `subtotal`. When present the
   * block itemises them BY NAME with their calculation (Items / each additional
   * cost / Subtotal) so no charge is ever an anonymous aggregate.
   */
  additionalLines?: AdditionalTotalsLine[];
  headerDiscountAmount?: MoneyValue | null;
  /** Read-only view: printed as "Discount (10%)" when > 0. */
  headerDiscountPercent?: MoneyValue | null;
  /** Editable view: percent + amount inputs (bidirectional). */
  discountEditor?: DiscountEditor;
  taxCode?: string | null;
  taxRate?: MoneyValue | null;
  taxAmount: MoneyValue | null;
  /**
   * `Tax.isExclude` of the document's tax, read live from the Tax master via
   * `taxCode` (never snapshotted on the document). `false` = Include: the tax is
   * already baked into Total, so the separate breakdown line is suppressed.
   * `true` = Exclude, and `null`/undefined (tax unknown, e.g. a code that is no
   * longer active) both keep the line visible exactly as before.
   */
  taxIsExclude?: boolean | null;
  totalAmount: MoneyValue;
}) {
  const showTaxLine = shouldShowTaxLine({ taxCode, taxAmount, taxIsExclude });
  return (
    <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">
      {additionalLines && additionalLines.length > 0 ? (
        <>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Items</dt>
            <dd className="text-slate-700">
              {formatIdr(
                roundMoney(
                  moneyNumber(subtotal) -
                    additionalLines.reduce((sum, line) => sum + moneyNumber(line.amount), 0),
                ),
              )}
            </dd>
          </div>
          {additionalLines.map((line) => (
            <div key={line.key} className="flex justify-between gap-4">
              <dt className="min-w-0 text-slate-700">
                <span className="block truncate">{line.description}</span>
                <span className="block text-xs text-slate-400">{line.calculation}</span>
              </dt>
              <dd className="shrink-0 text-slate-700">{formatIdr(line.amount)}</dd>
            </div>
          ))}
        </>
      ) : null}
      <div className="flex justify-between gap-4">
        <dt className="text-slate-500">Subtotal</dt>
        <dd className="font-medium text-slate-900">{formatIdr(subtotal)}</dd>
      </div>
      {discountEditor ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Discount (%)</dt>
            <dd className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="any"
                value={discountEditor.percentText}
                onChange={(e) => discountEditor.onPercentChange(e.target.value)}
                className="h-8 w-32 text-right"
                aria-label="Discount percent"
              />
              {/* <span className="text-slate-400">%</span> */}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Discount (Rp)</dt>
            <dd>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={discountEditor.amountText}
                onChange={(e) => discountEditor.onAmountChange(e.target.value)}
                className="h-8 w-32 text-right"
                aria-label="Discount amount"
              />
            </dd>
          </div>
          <p className="text-right text-xs text-slate-400">
            Isi salah satu — yang lain dihitung otomatis dari subtotal.
          </p>
          {discountEditor.error ? (
            <p className="text-right text-xs text-red-600">{discountEditor.error}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">
            Discount
            {moneyNumber(headerDiscountPercent) > 0 ? (
              <span className="ml-1 text-xs text-slate-400">
                ({new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(
                  moneyNumber(headerDiscountPercent),
                )}
                %)
              </span>
            ) : null}
          </dt>
          <dd className="font-medium text-slate-900">{formatIdr(headerDiscountAmount)}</dd>
        </div>
      )}
      {showTaxLine ? (
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
      ) : taxIsExclude === false ? null : (
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

/** Read-only table of commercial additional items (quotation detail and PO detail). */
export function AdditionalItemsTable({
  items,
  title = "Biaya Tambahan",
}: {
  items: Array<{
    id: string;
    description: string;
    unitLabel: string;
    qty: MoneyValue;
    multiplier?: MoneyValue | null;
    multiplierLabel?: string | null;
    unitPrice: MoneyValue;
    lineTotal: MoneyValue;
    notes?: string | null;
  }>;
  title?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-slate-900">
        {title} ({items.length})
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Deskripsi / Perhitungan</th>
              <th className="px-3 py-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 text-sm text-slate-900">
                  {item.description}
                  <p className="text-xs text-slate-500">
                    {describeAdditionalCalculation(formatIdr(item.unitPrice), {
                      qty: moneyNumber(item.qty),
                      unitLabel: item.unitLabel,
                      multiplier: item.multiplier == null ? null : moneyNumber(item.multiplier),
                      multiplierLabel: item.multiplierLabel,
                    })}
                  </p>
                  {item.notes ? <p className="text-xs text-slate-500">{item.notes}</p> : null}
                </td>
                <td className="px-3 py-3 text-right text-sm font-medium text-slate-900">
                  {formatIdr(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type QuotationFormItem = {
  requestItemId: string;
  description: string;
  qty: string;
  unitPrice: string;
  discountAmount: string;
  /** Alias when the customer gave one, otherwise the master device name. */
  deviceLabel: string;
  /** Master device name, shown under `deviceLabel` — null when it IS `deviceLabel`. */
  deviceTypeLabel: string | null;
  deviceIdLabel: string;
  /**
   * New-quotation flow only: the server-resolved Price List tariff is missing
   * for this line. Mirrors QuotationItem.pricePending — the quotation can still
   * be created (DRAFT) but not sent until a unit price is entered.
   */
  pricePending?: boolean;
};

export function itemsFromRequest(
  items: Array<{
    id: string;
    deviceId: string | null;
    customerDeviceName?: string | null;
    qty?: number | string | null;
    deviceType: { name: string };
  }>,
): QuotationFormItem[] {
  return items.map((item) => {
    const names = deviceDisplayNames({
      customerDeviceName: item.customerDeviceName,
      deviceTypeName: item.deviceType.name,
    });
    return {
      requestItemId: item.id,
      description: item.deviceType.name,
      // Carry the requisition's commercial quantity verbatim — never default to 1
      // when a real value is available (Price List Phase 1, BR-03 / QTY BUG fix).
      qty: item.qty != null ? String(item.qty) : "1",
      unitPrice: "",
      discountAmount: "0",
      deviceLabel: names.primary ?? item.deviceType.name,
      deviceTypeLabel: names.secondary,
      deviceIdLabel: item.deviceId ?? "—",
    };
  });
}

export function itemsFromQuotation(quotation: QuotationRow): QuotationFormItem[] {
  return quotation.items.map((item) => {
    const names = deviceDisplayNames({
      customerDeviceName: item.requestItem?.customerDeviceName,
      deviceTypeName: item.requestItem?.deviceType.name,
      fallback: item.description,
    });
    return {
      requestItemId: item.requestItemId ?? "",
      description: item.description,
      qty: formatQty(item.qty),
      unitPrice: String(item.unitPrice),
      discountAmount: String(item.discountAmount ?? 0),
      deviceLabel: names.primary ?? item.description,
      deviceTypeLabel: names.secondary,
      deviceIdLabel: item.requestItem?.deviceId ?? "—",
    };
  });
}

/**
 * Additional (commercial, non-calibration) line as edited in a form. Mirrors the
 * server snapshot: `code` / `unitLabel` are copied from the catalog when the row
 * is added and never re-read.
 */
export type QuotationFormAdditionalItem = {
  key: string;
  /** Server row id — present only for an existing row on the revise form. */
  id?: string;
  additionalItemTypeId: string;
  code: string;
  unitLabel: string;
  description: string;
  qty: string;
  /** Second multiplier text (e.g. days); "" when the type has none. */
  multiplier: string;
  /** Label of the second multiplier from the catalog snapshot; null = simple qty line. */
  multiplierLabel: string | null;
  unitPrice: string;
  notes: string;
};

export function additionalItemsFromQuotation(
  quotation: Pick<QuotationRow, "additionalItems">,
): QuotationFormAdditionalItem[] {
  return (quotation.additionalItems ?? []).map((item) => ({
    key: item.id,
    id: item.id,
    additionalItemTypeId: item.additionalItemTypeId,
    code: item.code,
    unitLabel: item.unitLabel,
    description: item.description,
    qty: formatQty(item.qty),
    multiplier: item.multiplier == null ? "" : formatQty(item.multiplier),
    multiplierLabel: item.multiplierLabel ?? null,
    unitPrice: String(item.unitPrice),
    notes: item.notes ?? "",
  }));
}

/** Wire shape for `additionalItems` (create / PATCH / revise). */
export function additionalItemsPayload(rows: QuotationFormAdditionalItem[]) {
  return rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    additionalItemTypeId: row.additionalItemTypeId,
    description: row.description.trim() || undefined,
    qty: Number(row.qty),
    // The amount is never sent: the server computes unitPrice x qty x (multiplier ?? 1).
    ...(row.multiplierLabel ? { multiplier: Number(row.multiplier) } : {}),
    unitPrice: moneyNumber(row.unitPrice),
    notes: row.notes.trim() ? row.notes.trim() : null,
  }));
}

/** First problem in the additional rows, or null — shared by new / edit / revise submit. */
export function validateAdditionalItems(rows: QuotationFormAdditionalItem[]): string | null {
  for (const [index, row] of rows.entries()) {
    const label = `Biaya tambahan #${index + 1}`;
    if (!row.additionalItemTypeId) return `${label}: pilih jenis biaya.`;
    if (!isPositiveIntegerQty(row.qty)) return `${label}: qty harus bilangan bulat lebih dari 0.`;
    if (!(moneyNumber(row.unitPrice) > 0)) return `${label}: unit price harus lebih dari 0.`;
    if (row.multiplierLabel && !isPositiveIntegerQty(row.multiplier)) {
      return `${label}: jumlah ${row.multiplierLabel} harus bilangan bulat lebih dari 0.`;
    }
  }
  return null;
}

/** The header discount exactly as the user entered it: which field + its typed text. */
export type DiscountInput = { mode: DiscountInputMode; value: string };

export function discountInputFromQuotation(
  quotation: Pick<
    QuotationRow,
    "headerDiscountInputMode" | "headerDiscountAmount" | "headerDiscountPercent"
  >,
): DiscountInput {
  return quotation.headerDiscountInputMode === "PERCENT"
    ? { mode: "PERCENT", value: String(moneyNumber(quotation.headerDiscountPercent)) }
    : { mode: "AMOUNT", value: String(moneyNumber(quotation.headerDiscountAmount)) };
}

/**
 * Wire shape for the discount: ONLY the field the user typed (the server derives
 * the other and rejects a payload carrying both).
 */
export function discountPayload(
  discount: DiscountInput,
): { headerDiscountPercent: number } | { headerDiscountAmount: number } {
  return discount.mode === "PERCENT"
    ? { headerDiscountPercent: moneyNumber(discount.value) }
    : { headerDiscountAmount: moneyNumber(discount.value) };
}

const DISCOUNT_ERROR_TEXT: Record<HeaderDiscountErrorCode, string> = {
  INVALID_HEADER_DISCOUNT: "Discount tidak boleh negatif.",
  INVALID_HEADER_DISCOUNT_PERCENT: "Persentase discount harus antara 0 dan 100.",
  HEADER_DISCOUNT_EXCEEDS_SUBTOTAL: "Discount tidak boleh melebihi subtotal.",
};

export function discountErrorText(code: HeaderDiscountErrorCode | null): string | null {
  return code ? DISCOUNT_ERROR_TEXT[code] : null;
}

/**
 * Client-side mirror of the server's total calculation (same shared discount
 * function, same half-up cents rounding):
 *   lineTotal = round(qty x unitPrice) - lineDiscount     (calibration + additional)
 *   subtotal  = Σ lineTotal
 *   discount  = resolveHeaderDiscount(subtotal, mode, value)
 *   net       = subtotal - discount.amount
 *   tax       = exclusive: round(net x rate); inclusive: round(net x rate / (1 + rate))
 *   total     = exclusive: net + tax; inclusive / no tax: net
 */
export function previewTotals(
  items: QuotationFormItem[],
  tax?: Pick<TaxOption, "taxRate" | "isExclude"> | null,
  discount?: DiscountInput | null,
  additionalItems: QuotationFormAdditionalItem[] = [],
): {
  subtotal: number;
  headerDiscountAmount: number;
  headerDiscountPercent: number;
  discountError: HeaderDiscountErrorCode | null;
  taxAmount: number | null;
  totalAmount: number;
} {
  const lineTotal = (qtyText: string, unitPrice: string, discountText: string) =>
    roundMoney(moneyNumber(qtyText || "1") * moneyNumber(unitPrice)) -
    roundMoney(moneyNumber(discountText));
  // Additional lines: unitPrice x qty x (multiplier ?? 1), no per-line discount (the server
  // computes the authoritative amount; this mirrors it for the live form).
  const additionalTotal = additionalItems.reduce(
    (sum, item) =>
      sum +
      additionalLineTotal(
        moneyNumber(item.unitPrice),
        moneyNumber(item.qty || "0"),
        item.multiplierLabel ? moneyNumber(item.multiplier || "0") : null,
      ),
    0,
  );
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + lineTotal(item.qty, item.unitPrice, item.discountAmount), 0) +
      additionalTotal,
  );

  const resolved = resolveHeaderDiscount({
    subtotal,
    mode: discount?.mode ?? "AMOUNT",
    value: moneyNumber(discount?.value),
  });
  const discountError = resolved.ok ? null : resolved.code;
  const headerDiscountAmount = resolved.ok ? resolved.amount : 0;
  const headerDiscountPercent = resolved.ok ? resolved.percent : 0;

  const netAmount = roundMoney(subtotal - headerDiscountAmount);
  const base = {
    subtotal,
    headerDiscountAmount,
    headerDiscountPercent,
    discountError,
  };
  if (!tax) {
    return { ...base, taxAmount: null, totalAmount: netAmount };
  }
  const rate = moneyNumber(tax.taxRate);
  if (rate === 0) {
    return { ...base, taxAmount: 0, totalAmount: netAmount };
  }
  if (tax.isExclude) {
    const taxAmount = roundMoney(netAmount * rate);
    return { ...base, taxAmount, totalAmount: roundMoney(netAmount + taxAmount) };
  }
  const taxAmount = roundMoney((netAmount * rate) / (1 + rate));
  return { ...base, taxAmount, totalAmount: netAmount };
}

/**
 * Text for the two discount inputs: the SOURCE field shows exactly what the user
 * typed, the other shows the value derived from the current subtotal.
 */
export function discountEditorTexts(
  discount: DiscountInput,
  totals: Pick<ReturnType<typeof previewTotals>, "headerDiscountAmount" | "headerDiscountPercent" | "discountError">,
): { percentText: string; amountText: string } {
  const derivable = discount.value.trim() !== "" && totals.discountError === null;
  if (discount.mode === "PERCENT") {
    return {
      percentText: discount.value,
      amountText: derivable ? String(totals.headerDiscountAmount) : "",
    };
  }
  return {
    percentText: derivable ? String(totals.headerDiscountPercent) : "",
    amountText: discount.value,
  };
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
      DUPLICATE_QUOTATION_FOR_REQUEST: "Quotation untuk requisition ini sudah ada.",
      CALIBRATION_REQUEST_NOT_FOUND: "Requisition tidak ditemukan.",
      INVALID_STATUS_FOR_QUOTATION: "Requisition belum dalam status yang bisa dibuatkan quotation.",
      QUOTATION_SCOPE_MISMATCH: "Item quotation harus mencakup seluruh item Requisition.",
      DUPLICATE_REQUEST_ITEM: "Item requisition tidak boleh diduplikasi pada quotation.",
      TARIFF_NOT_FOUND: "Satu atau lebih tariff tidak ditemukan.",
      DEVICE_NOT_FOUND: "Satu atau lebih device tidak ditemukan untuk customer ini.",
      TAX_NOT_FOUND: "Tax tidak ditemukan.",
      INVALID_ITEM_DISCOUNT: "Diskon item tidak boleh negatif.",
      ITEM_DISCOUNT_EXCEEDS_GROSS: "Diskon item tidak boleh melebihi jumlah bruto item.",
      INVALID_HEADER_DISCOUNT: "Header discount tidak boleh negatif.",
      INVALID_HEADER_DISCOUNT_PERCENT: "Persentase discount harus antara 0 dan 100.",
      HEADER_DISCOUNT_EXCEEDS_SUBTOTAL: "Header discount tidak boleh melebihi subtotal.",
      DISCOUNT_FIELDS_CONFLICT: "Isi persentase atau nominal discount, bukan keduanya.",
      QUOTATION_DATE_IN_FUTURE: "Tanggal quotation tidak boleh di masa depan.",
      VALID_UNTIL_BEFORE_QUOTATION_DATE: "Tanggal 'Valid Until' tidak boleh sebelum tanggal quotation.",
      ADDITIONAL_ITEM_TYPE_NOT_FOUND: "Jenis biaya tambahan tidak ditemukan.",
      ADDITIONAL_ITEM_TYPE_INACTIVE: "Jenis biaya tambahan tidak aktif.",
      ADDITIONAL_ITEM_TYPE_MODE_MISMATCH:
        "Jenis biaya tambahan ini tidak berlaku untuk mode layanan requisition.",
      ADDITIONAL_ITEM_PRICE_REQUIRED: "Isi unit price untuk biaya tambahan.",
      INVALID_ADDITIONAL_ITEM_PRICE: "Unit price biaya tambahan harus lebih dari 0.",
      QUOTATION_ADDITIONAL_ITEM_NOT_FOUND:
        "Satu atau lebih biaya tambahan revisi tidak ditemukan pada quotation ini.",
      INVALID_STATUS_FOR_UPDATE: "Hanya quotation DRAFT yang dapat diedit.",
      INVALID_STATUS_FOR_SEND: "Hanya quotation DRAFT yang dapat dikirim.",
      INVALID_STATUS_FOR_APPROVE: "Hanya quotation DRAFT atau SENT yang dapat di-approve.",
      INVALID_STATUS_FOR_REJECT: "Hanya quotation SENT yang dapat di-reject.",
      ALREADY_CANCELLED: "Quotation sudah dibatalkan.",
      CANNOT_CANCEL_APPROVED: "Quotation yang sudah di-approve tidak dapat dibatalkan.",
      QUOTATION_NOT_FOUND: "Quotation tidak ditemukan.",
      // MOM #1 — Final Revision Scope Design
      INVALID_STATUS_FOR_REVISE: "Quotation tidak dalam status yang bisa direvisi.",
      QUOTATION_ITEM_NOT_FOUND: "Satu atau lebih item revisi tidak ditemukan pada quotation ini.",
      CALIBRATION_REQUEST_ITEM_NOT_FOUND: "Item requisition sumber tidak ditemukan.",
      RETIREMENT_BLOCKED_BY_WORK_ORDER_PROGRESS:
        "Item ini sudah mencapai Work Order yang sedang berjalan (bukan PLANNED/ASSIGNED) dan tidak dapat dihapus melalui revisi.",
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
  quotation: Pick<QuotationRow, "number" | "companyId" | "quotationDate">,
): string {
  return quotationPdfFilename({
    number: quotation.number,
    companyId: quotation.companyId,
    issuedAt: quotation.quotationDate,
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
      `Tanggal: ${formatDateOnly(quotation.quotationDate)}.`,
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
