"use client";

import Link from "next/link";
import { SortableTh } from "@/components/ui/sortable-th";
import type { TableSort } from "@/hooks/use-table-sort";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PaginationBar, Surface, formatRelativeTime, selectClassName } from "../leads/leads-ui";
import { ConfirmDialog, DetailField } from "../calibration-requests/calibration-requests-ui";
import {
  PageHeader,
  QuotationTotals,
  formatDate,
  formatIdr,
  formatQty,
  quotationPdfFilename,
  type MoneyValue,
  type QuotationCustomer,
  type QuotationItem,
  type QuotationRow,
} from "../quotations/quotations-ui";
import { formatTaxHeaderLabel, type PurchaseOrderStatus } from "./purchase-order-form-utils";

export type { PurchaseOrderStatus };

export interface PurchaseOrderQuotationRef {
  id: string;
  number: string;
  status: string;
  requestId: string;
  customerId: string;
  request?: { number: string } | null;
}

export interface PurchaseOrderItem {
  id: string;
  quotationItemId: string;
  deviceId: string | null;
  tariffId: string | null;
  description: string;
  qty: MoneyValue;
  unitPrice: MoneyValue;
  discountAmount: MoneyValue;
  lineTotal: MoneyValue;
  status: string;
  quotationItem: {
    requestItem: {
      deviceId: string;
      deviceType: { id: string; code: string; name: string };
    } | null;
  } | null;
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

export interface PurchaseOrderRow {
  id: string;
  companyId: string;
  customerId: string;
  quotationId: string;
  number: string;
  customerPoNumber: string;
  customerPoDate: string;
  status: PurchaseOrderStatus;
  subtotal: MoneyValue;
  headerDiscountAmount: MoneyValue;
  taxCode: string;
  taxRate: MoneyValue;
  taxAmount: MoneyValue;
  totalAmount: MoneyValue;
  currency: string;
  notes: string | null;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItem[];
  customer: QuotationCustomer;
  quotation: PurchaseOrderQuotationRef;
}

export interface PurchaseOrderListResponse {
  data: PurchaseOrderRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type SnapshotLine = {
  id: string;
  description: string;
  deviceTypeName: string | null;
  deviceId: string | null;
  qty: MoneyValue;
  unitPrice: MoneyValue;
  discountAmount: MoneyValue;
  lineTotal: MoneyValue;
};

export const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export const STATUS_OPTIONS: PurchaseOrderStatus[] = ["DRAFT", "APPROVED", "CANCELLED"];

const STATUS_BADGE_CLASS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
  APPROVED: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  CANCELLED: "border-transparent bg-slate-400 text-white hover:bg-slate-400",
};

export {
  PageHeader,
  Surface,
  selectClassName,
  PaginationBar,
  ConfirmDialog,
  DetailField,
  QuotationTotals,
};

export function purchaseOrderPdfFilenameForRow(
  purchaseOrder: Pick<PurchaseOrderRow, "number" | "companyId" | "createdAt">,
): string {
  return quotationPdfFilename({
    number: purchaseOrder.number,
    companyId: purchaseOrder.companyId,
    issuedAt: purchaseOrder.createdAt,
  });
}

export function snapshotLinesFromQuotation(quotation: QuotationRow): SnapshotLine[] {
  return quotation.items.map((item) => snapshotLineFromQuotationItem(item));
}

export function snapshotLinesFromPurchaseOrder(purchaseOrder: PurchaseOrderRow): SnapshotLine[] {
  return purchaseOrder.items.map((item) => ({
    id: item.id,
    description: item.description,
    deviceTypeName: item.quotationItem?.requestItem?.deviceType.name ?? item.device?.model ?? null,
    deviceId: item.quotationItem?.requestItem?.deviceId ?? item.deviceId,
    qty: item.qty,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    lineTotal: item.lineTotal,
  }));
}

function snapshotLineFromQuotationItem(item: QuotationItem): SnapshotLine {
  return {
    id: item.id,
    description: item.description,
    deviceTypeName: item.requestItem?.deviceType.name ?? null,
    deviceId: item.requestItem?.deviceId ?? item.deviceId,
    qty: item.qty,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    lineTotal: item.lineTotal,
  };
}

export function StatusBadge({ status }: { status: string }) {
  const known = status as PurchaseOrderStatus;
  const label = STATUS_LABELS[known] ?? status;
  const badgeClass = STATUS_BADGE_CLASS[known] ?? STATUS_BADGE_CLASS.DRAFT;
  return (
    <Badge
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        badgeClass,
      )}
    >
      {label}
    </Badge>
  );
}

export function PurchaseOrderFilters({
  searchInput,
  onSearchChange,
  status,
  onStatusChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: PurchaseOrderStatus | "";
  onStatusChange: (value: PurchaseOrderStatus | "") => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nomor PO, Customer PO No, atau customer…"
          className="pl-9"
          aria-label="Cari purchase order"
        />
      </div>
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as PurchaseOrderStatus | "")}
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

export function PurchaseOrderTable({
  purchaseOrders,
  sort,
}: {
  purchaseOrders: PurchaseOrderRow[];
  sort: TableSort;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <SortableTh field="number" label="PO Number" sort={sort} />
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Quotation</th>
            <th className="px-4 py-3">Customer PO No</th>
            <th className="px-4 py-3">Customer PO Date</th>
            <SortableTh field="status" label="Status" sort={sort} />
            <th className="px-4 py-3">Total</th>
            <SortableTh field="createdAt" label="Created At" sort={sort} />
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {purchaseOrders.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.number}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{row.customer.name}</p>
                <p className="text-xs text-slate-400">{row.customer.number}</p>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.quotation.number}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.customerPoNumber}</td>
              <td className="px-4 py-3 text-sm text-slate-500">{formatDate(row.customerPoDate)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {formatIdr(row.totalAmount)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-500">
                {formatRelativeTime(row.createdAt)}
              </td>
              <td className="px-4 py-3">
                <Link href={`/purchase-orders/${row.id}`}>
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

export function PurchaseOrderEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        {onClearFilters
          ? "Belum ada purchase order yang cocok dengan filter."
          : "Belum ada purchase order. Buat PO dari Quotation yang sudah di-approve."}
      </p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export function PurchaseOrderSnapshot({
  quotationNumber,
  quotationId,
  requestId,
  requestNumber,
  customer,
  items,
  subtotal,
  headerDiscountAmount,
  taxCode,
  taxRate,
  taxAmount,
  totalAmount,
  currency,
  taxDescription,
}: {
  quotationNumber: string;
  quotationId: string;
  requestId?: string | null;
  requestNumber?: string | null;
  customer: QuotationCustomer;
  items: SnapshotLine[];
  subtotal: MoneyValue;
  headerDiscountAmount: MoneyValue;
  taxCode: string;
  taxRate: MoneyValue;
  taxAmount: MoneyValue;
  totalAmount: MoneyValue;
  currency: string;
  taxDescription?: string | null;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Quotation Snapshot</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <DetailField label="Quotation">
          <Link
            href={`/quotations/${quotationId}`}
            className="font-mono text-brand-700 hover:underline"
          >
            {quotationNumber}
          </Link>
        </DetailField>
        <DetailField label="Customer">
          <Link
            href={`/customers/${customer.id}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {customer.name}
          </Link>
          <span className="ml-2 text-slate-400">({customer.number})</span>
        </DetailField>
        {requestId ? (
          <DetailField label="Requisition">
            <Link
              href={`/calibration-requests/${requestId}`}
              className="font-mono text-brand-700 hover:underline"
            >
              {requestNumber ?? "Buka Requisition"}
            </Link>
          </DetailField>
        ) : null}
        <DetailField label="Currency">{currency || "IDR"}</DetailField>
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Items ({items.length})</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Discount</th>
                <th className="px-3 py-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3">
                    <p className="text-sm text-slate-900">{item.description}</p>
                    {item.deviceTypeName ? (
                      <p className="text-xs text-slate-500">{item.deviceTypeName}</p>
                    ) : null}
                    {item.deviceId ? (
                      <p className="font-mono text-xs text-slate-400">{item.deviceId}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-slate-600">
                    {formatQty(item.qty)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-slate-600">
                    {formatIdr(item.unitPrice)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-slate-600">
                    {formatIdr(item.discountAmount)}
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

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <DetailField label="Tax">
          {formatTaxHeaderLabel(taxCode, taxRate, taxDescription)}
        </DetailField>
        <DetailField label="Tax Amount">{formatIdr(taxAmount)}</DetailField>
      </dl>

      <QuotationTotals
        subtotal={subtotal}
        headerDiscountAmount={headerDiscountAmount}
        taxCode={taxCode}
        taxRate={taxRate}
        taxAmount={taxAmount}
        totalAmount={totalAmount}
      />
    </section>
  );
}
