import { describe, expect, it } from "vitest";
import { applyResolvedPrices, type QuotationPreviewLine } from "./quotation-preview";
import type { QuotationFormItem } from "./quotations-ui";

function item(overrides: Partial<QuotationFormItem>): QuotationFormItem {
  return {
    requestItemId: "ri-1",
    description: "Bio Safety Cabinet",
    qty: "3",
    unitPrice: "",
    discountAmount: "0",
    deviceLabel: "Bio Safety Cabinet",
    deviceTypeLabel: null,
    deviceIdLabel: "—",
    ...overrides,
  };
}

function line(overrides: Partial<QuotationPreviewLine>): QuotationPreviewLine {
  return {
    requestItemId: "ri-1",
    description: "Bio Safety Cabinet",
    qty: 3,
    unitPrice: 0,
    lineTotal: 0,
    pricePending: false,
    ...overrides,
  };
}

describe("applyResolvedPrices", () => {
  it("overlays a resolved tariff onto the matching row and clears pending", () => {
    const result = applyResolvedPrices(
      [item({ requestItemId: "ri-1" })],
      [line({ requestItemId: "ri-1", unitPrice: "1250000", lineTotal: "3750000" })],
    );
    expect(result[0]?.unitPrice).toBe("1250000");
    expect(result[0]?.pricePending).toBe(false);
  });

  it("gives each row its own tariff", () => {
    const result = applyResolvedPrices(
      [
        item({ requestItemId: "ri-1" }),
        item({ requestItemId: "ri-2", description: "Audiometer" }),
      ],
      [
        line({ requestItemId: "ri-1", unitPrice: "1250000" }),
        line({ requestItemId: "ri-2", unitPrice: "800000" }),
      ],
    );
    expect(result[0]?.unitPrice).toBe("1250000");
    expect(result[1]?.unitPrice).toBe("800000");
  });

  it("keeps unitPrice empty and marks pricePending when the tariff is missing", () => {
    const result = applyResolvedPrices(
      [item({ requestItemId: "ri-1" })],
      [line({ requestItemId: "ri-1", unitPrice: 0, pricePending: true })],
    );
    expect(result[0]?.unitPrice).toBe("");
    expect(result[0]?.pricePending).toBe(true);
  });

  it("leaves rows untouched when there is no preview yet", () => {
    const rows = [item({ requestItemId: "ri-1", unitPrice: "" })];
    expect(applyResolvedPrices(rows, undefined)).toBe(rows);
    expect(applyResolvedPrices(rows, [])).toBe(rows);
  });

  it("does not change qty (unit price stays per-unit)", () => {
    const result = applyResolvedPrices(
      [item({ requestItemId: "ri-1", qty: "4" })],
      [line({ requestItemId: "ri-1", qty: 4, unitPrice: "100000", lineTotal: "400000" })],
    );
    expect(result[0]?.qty).toBe("4");
    expect(Number(result[0]?.unitPrice) * Number(result[0]?.qty)).toBe(400000);
  });
});
