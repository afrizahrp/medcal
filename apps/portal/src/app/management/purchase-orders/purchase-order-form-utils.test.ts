import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  buildPurchaseOrderCreatePayload,
  buildPurchaseOrderUpdatePayload,
  canCreatePurchaseOrderFromQuotation,
  findActivePurchaseOrder,
  formatPurchaseOrderApiError,
  formatTaxHeaderLabel,
  isActivePurchaseOrderStatus,
  purchaseOrderActions,
  validatePurchaseOrderForm,
} from "./purchase-order-form-utils";

describe("purchaseOrderActions", () => {
  it("exposes Edit/Approve/Cancel only for DRAFT", () => {
    expect(purchaseOrderActions("DRAFT")).toEqual({
      canEdit: true,
      canApprove: true,
      canCancel: true,
      isLocked: false,
    });
  });

  it("locks APPROVED without cancel", () => {
    expect(purchaseOrderActions("APPROVED")).toEqual({
      canEdit: false,
      canApprove: false,
      canCancel: false,
      isLocked: true,
    });
  });

  it("locks CANCELLED", () => {
    expect(purchaseOrderActions("CANCELLED")).toEqual({
      canEdit: false,
      canApprove: false,
      canCancel: false,
      isLocked: true,
    });
  });
});

describe("canCreatePurchaseOrderFromQuotation", () => {
  it("allows APPROVED quotation with customerApprovedAt", () => {
    expect(
      canCreatePurchaseOrderFromQuotation({
        status: "APPROVED",
        customerApprovedAt: "2026-08-15T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("rejects APPROVED quotation without customer approval", () => {
    expect(
      canCreatePurchaseOrderFromQuotation({
        status: "APPROVED",
        customerApprovedAt: null,
      }),
    ).toBe(false);
  });

  it("rejects non-APPROVED quotation", () => {
    expect(
      canCreatePurchaseOrderFromQuotation({
        status: "SENT",
        customerApprovedAt: "2026-08-15T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("findActivePurchaseOrder", () => {
  it("treats cancelled PO as not blocking a new PO", () => {
    expect(isActivePurchaseOrderStatus("CANCELLED")).toBe(false);
    expect(
      findActivePurchaseOrder([
        { id: "po-1", status: "CANCELLED" },
        { id: "po-2", status: "DRAFT" },
      ]),
    ).toEqual({ id: "po-2", status: "DRAFT" });
  });

  it("returns undefined when only cancelled POs exist", () => {
    expect(findActivePurchaseOrder([{ id: "po-1", status: "CANCELLED" }])).toBeUndefined();
  });
});

describe("buildPurchaseOrderCreatePayload", () => {
  it("submits only PO-specific fields, date as a YYYY-MM-DD wire string", () => {
    const payload = buildPurchaseOrderCreatePayload({
      quotationId: "quo-1",
      customerPoNumber: "  PO-CUST-2026-0815  ",
      customerPoDate: "2026-08-15",
      notes: "  catatan  ",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["customerPoDate", "customerPoNumber", "notes", "quotationId"].sort(),
    );
    expect(payload).toEqual({
      quotationId: "quo-1",
      customerPoNumber: "PO-CUST-2026-0815",
      customerPoDate: "2026-08-15",
      notes: "catatan",
    });
    // Never a Date object on the wire — avoids the local-midnight TZ shift.
    expect(payload.customerPoDate).not.toBeInstanceOf(Date);
  });
});

describe("buildPurchaseOrderUpdatePayload", () => {
  it("does not include commercial snapshot fields", () => {
    const payload = buildPurchaseOrderUpdatePayload({
      customerPoNumber: "PO-CUST-2",
      customerPoDate: "2026-08-16",
      notes: "",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["customerPoDate", "customerPoNumber", "notes"].sort(),
    );
    expect(payload).toMatchObject({ customerPoDate: "2026-08-16" });
    expect(payload.notes).toBeNull();
  });
});

describe("validatePurchaseOrderForm", () => {
  it("requires customer PO number and date", () => {
    expect(
      validatePurchaseOrderForm({
        customerPoNumber: " ",
        customerPoDate: "",
        notes: "",
      }),
    ).toBe("Customer PO No wajib diisi.");
    expect(
      validatePurchaseOrderForm({
        customerPoNumber: "PO-1",
        customerPoDate: "",
        notes: "",
      }),
    ).toBe("Customer PO Date wajib diisi.");
  });
});

describe("formatTaxHeaderLabel", () => {
  it("uses tax master description when present", () => {
    expect(formatTaxHeaderLabel("T0", 0, "Non PPN")).toBe("T0 — Non PPN");
    expect(formatTaxHeaderLabel("T1", 0.11, "PPN")).toBe("T1 — PPN");
  });

  it("falls back to rate when description is missing", () => {
    expect(formatTaxHeaderLabel("T1", 0.11)).toMatch(/^T1 — 11\s?%$/);
  });
});

describe("formatPurchaseOrderApiError", () => {
  it("maps duplicate active PO and returns the existing id", () => {
    const err = new ApiError(409, "Conflict", {
      code: "DUPLICATE_ACTIVE_PO_FOR_QUOTATION",
      purchaseOrderId: "po-active",
    });
    expect(formatPurchaseOrderApiError(err, "fallback")).toEqual({
      message:
        "Quotation ini sudah memiliki Purchase Order aktif. Batalkan PO tersebut terlebih dahulu, atau buka PO yang sudah ada.",
      purchaseOrderId: "po-active",
    });
  });

  it("maps cannot cancel approved", () => {
    const err = new ApiError(400, "Bad Request", { code: "CANNOT_CANCEL_APPROVED" });
    expect(formatPurchaseOrderApiError(err, "fallback").message).toContain("tidak dapat dibatalkan");
  });
});
