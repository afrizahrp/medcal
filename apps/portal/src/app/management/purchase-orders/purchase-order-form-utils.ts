import { ApiError } from "@medcal/shared";
import type { PurchaseOrderCreateBody, PurchaseOrderUpdateBody } from "@medcal/shared";

export type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "CANCELLED";

function moneyNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isActivePurchaseOrderStatus(status: string): boolean {
  return status !== "CANCELLED";
}

export function findActivePurchaseOrder<T extends { status: string }>(rows: T[]): T | undefined {
  return rows.find((row) => isActivePurchaseOrderStatus(row.status));
}

export function canCreatePurchaseOrderFromQuotation(quotation: {
  status: string;
  customerApprovedAt: string | null;
}): boolean {
  return quotation.status === "APPROVED" && quotation.customerApprovedAt != null;
}

export function purchaseOrderActions(status: string): {
  canEdit: boolean;
  canApprove: boolean;
  canCancel: boolean;
  isLocked: boolean;
  /**
   * MOM #1 — Transaction Revision + Immutable History. Revise is the
   * committed-document counterpart to Edit: legal exactly where Edit is not
   * (left DRAFT) and the document isn't terminal (CANCELLED/FULFILLED).
   * Matches REVISABLE_PURCHASE_ORDER_STATUSES in purchase-orders.service.ts.
   */
  canRevise: boolean;
} {
  if (status === "DRAFT") {
    return { canEdit: true, canApprove: true, canCancel: true, isLocked: false, canRevise: false };
  }
  const canRevise = status !== "CANCELLED" && status !== "FULFILLED";
  return { canEdit: false, canApprove: false, canCancel: false, isLocked: true, canRevise };
}

export function formatTaxHeaderLabel(
  taxCode: string,
  taxRate: string | number,
  description?: string | null,
): string {
  if (description?.trim()) {
    return `${taxCode} — ${description.trim()}`;
  }
  const rate = moneyNumber(taxRate);
  if (rate > 0) {
    return `${taxCode} — ${new Intl.NumberFormat("id-ID", {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(rate)}`;
  }
  return `${taxCode} — 0%`;
}

export function taxDescriptionForCode(
  taxes: Array<{ taxCode: string; description: string }> | undefined,
  taxCode: string,
): string | null {
  return taxes?.find((tax) => tax.taxCode === taxCode)?.description ?? null;
}

export function buildPurchaseOrderCreatePayload(input: {
  quotationId: string;
  customerPoNumber: string;
  /** `YYYY-MM-DD`. */
  customerPoDate: string;
  notes: string;
}): PurchaseOrderCreateBody {
  return {
    quotationId: input.quotationId,
    customerPoNumber: input.customerPoNumber.trim(),
    customerPoDate: input.customerPoDate,
    notes: input.notes.trim() ? input.notes.trim() : null,
  };
}

export function buildPurchaseOrderUpdatePayload(input: {
  customerPoNumber: string;
  /** `YYYY-MM-DD`. */
  customerPoDate: string;
  notes: string;
}): PurchaseOrderUpdateBody {
  return {
    customerPoNumber: input.customerPoNumber.trim(),
    customerPoDate: input.customerPoDate,
    notes: input.notes.trim() ? input.notes.trim() : null,
  };
}

export function validatePurchaseOrderForm(input: {
  customerPoNumber: string;
  /** `YYYY-MM-DD`, or `""` when unset. */
  customerPoDate: string;
  notes: string;
}): string | null {
  const number = input.customerPoNumber.trim();
  if (!number) return "Customer PO No wajib diisi.";
  if (number.length > 100) return "Customer PO No maksimal 100 karakter.";
  if (!input.customerPoDate) return "Customer PO Date wajib diisi.";
  if (input.notes.length > 2000) return "Notes maksimal 2000 karakter.";
  return null;
}

export function formatPurchaseOrderApiError(
  err: unknown,
  fallback: string,
): { message: string; purchaseOrderId?: string } {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    const purchaseOrderId =
      typeof err.data?.purchaseOrderId === "string" ? err.data.purchaseOrderId : undefined;
    const messages: Record<string, string> = {
      DUPLICATE_ACTIVE_PO_FOR_QUOTATION:
        "Quotation ini sudah memiliki Purchase Order aktif. Batalkan PO tersebut terlebih dahulu, atau buka PO yang sudah ada.",
      DUPLICATE_CUSTOMER_PO_NUMBER:
        "Customer PO No sudah terdaftar untuk customer ini.",
      INVALID_STATUS_FOR_PURCHASE_ORDER:
        "Hanya quotation APPROVED yang dapat dibuatkan Purchase Order.",
      QUOTATION_NOT_CUSTOMER_APPROVED:
        "Quotation belum disetujui customer.",
      QUOTATION_HAS_NO_ITEMS: "Quotation tidak memiliki item untuk di-snapshot.",
      QUOTATION_TAX_REQUIRED: "Tax quotation wajib ada sebelum membuat Purchase Order.",
      QUOTATION_NOT_FOUND: "Quotation tidak ditemukan.",
      PURCHASE_ORDER_NOT_FOUND: "Purchase Order tidak ditemukan.",
      INVALID_STATUS_FOR_UPDATE: "Hanya Purchase Order DRAFT yang dapat diedit.",
      INVALID_STATUS_FOR_APPROVE: "Hanya Purchase Order DRAFT yang dapat di-approve.",
      INVALID_STATUS_FOR_CANCEL: "Hanya Purchase Order DRAFT yang dapat dibatalkan.",
      CANNOT_CANCEL_APPROVED: "Purchase Order yang sudah di-approve tidak dapat dibatalkan.",
      ALREADY_CANCELLED: "Purchase Order sudah dibatalkan.",
      PURCHASE_ORDER_HAS_NO_ITEMS: "Purchase Order tidak memiliki item.",
      // MOM #1 — Transaction Revision + Immutable History
      INVALID_STATUS_FOR_REVISE: "Purchase Order tidak dalam status yang bisa direvisi.",
      NO_PENDING_SCOPE_CHANGE:
        "Tidak ada perubahan scope dari Quotation untuk diterapkan ke Purchase Order ini.",
    };
    if (code && messages[code]) {
      return { message: messages[code], purchaseOrderId };
    }
    if (typeof err.data?.message === "string") {
      return { message: err.data.message, purchaseOrderId };
    }
    return { message: err.message, purchaseOrderId };
  }
  return { message: fallback };
}
