import { describe, expect, it } from "vitest";
import {
  additionalItemsPayload,
  additionalTotalsLines,
  discountEditorTexts,
  discountErrorText,
  discountInputFromQuotation,
  discountPayload,
  formatDateOnly,
  previewTotals,
  quotationPdfFilenameForRow,
  todayIsoJakarta,
  validateAdditionalItems,
  type QuotationFormAdditionalItem,
  type QuotationFormItem,
} from "./quotations-ui";

function item(overrides: Partial<QuotationFormItem> = {}): QuotationFormItem {
  return {
    requestItemId: "ri-1",
    description: "Device",
    qty: "1",
    unitPrice: "1000000",
    discountAmount: "0",
    deviceLabel: "Device",
    deviceTypeLabel: null,
    deviceIdLabel: "—",
    ...overrides,
  };
}

function extra(overrides: Partial<QuotationFormAdditionalItem> = {}): QuotationFormAdditionalItem {
  return {
    key: "k1",
    additionalItemTypeId: "type-1",
    code: "ACC",
    unitLabel: "malam",
    description: "Akomodasi",
    qty: "2",
    multiplier: "",
    multiplierLabel: null,
    unitPrice: "500000",
    notes: "",
    ...overrides,
  };
}

const exclusive11 = { taxRate: "0.11", isExclude: true } as const;
const inclusive11 = { taxRate: "0.11", isExclude: false } as const;

describe("previewTotals — header discount (percent <-> amount)", () => {
  it("percent input derives the amount: 10% of 1.000.000 = 100.000", () => {
    const totals = previewTotals([item()], null, { mode: "PERCENT", value: "10" });
    expect(totals).toMatchObject({
      subtotal: 1_000_000,
      headerDiscountAmount: 100_000,
      headerDiscountPercent: 10,
      discountError: null,
      totalAmount: 900_000,
    });
  });

  it("amount input derives the percent: 100.000 of 1.000.000 = 10%", () => {
    const totals = previewTotals([item()], null, { mode: "AMOUNT", value: "100000" });
    expect(totals).toMatchObject({
      headerDiscountAmount: 100_000,
      headerDiscountPercent: 10,
      totalAmount: 900_000,
    });
  });

  it("supports decimal percentages and half-up cents", () => {
    expect(previewTotals([item()], null, { mode: "PERCENT", value: "12.5" })).toMatchObject({
      headerDiscountAmount: 125_000,
    });
    expect(
      previewTotals([item({ unitPrice: "333333" })], null, { mode: "PERCENT", value: "10" }),
    ).toMatchObject({ headerDiscountAmount: 33_333.3, totalAmount: 299_999.7 });
    expect(
      previewTotals([item()], null, { mode: "AMOUNT", value: "333333.33" }),
    ).toMatchObject({ headerDiscountPercent: 33.3333 });
  });

  it("a missing / empty discount is zero", () => {
    expect(previewTotals([item()], null)).toMatchObject({ headerDiscountAmount: 0, totalAmount: 1_000_000 });
    expect(previewTotals([item()], null, { mode: "AMOUNT", value: "" })).toMatchObject({
      headerDiscountAmount: 0,
      discountError: null,
    });
  });

  it("reports (and does not apply) an invalid discount", () => {
    const tooMuch = previewTotals([item()], null, { mode: "AMOUNT", value: "2000000" });
    expect(tooMuch.discountError).toBe("HEADER_DISCOUNT_EXCEEDS_SUBTOTAL");
    expect(tooMuch.headerDiscountAmount).toBe(0);
    expect(discountErrorText(tooMuch.discountError)).toMatch(/subtotal/);

    const badPercent = previewTotals([item()], null, { mode: "PERCENT", value: "101" });
    expect(badPercent.discountError).toBe("INVALID_HEADER_DISCOUNT_PERCENT");
    const negative = previewTotals([item()], null, { mode: "AMOUNT", value: "-5" });
    expect(negative.discountError).toBe("INVALID_HEADER_DISCOUNT");
    expect(discountErrorText(null)).toBeNull();
  });

  it("applies the discount before tax (exclusive and inclusive)", () => {
    expect(
      previewTotals([item()], exclusive11, { mode: "PERCENT", value: "10" }),
    ).toMatchObject({ taxAmount: 99_000, totalAmount: 999_000 });
    expect(
      previewTotals([item()], inclusive11, { mode: "PERCENT", value: "10" }),
    ).toMatchObject({ taxAmount: 89_189.19, totalAmount: 900_000 });
  });

  it("the discount base is the COMBINED subtotal (calibration + additional lines)", () => {
    const totals = previewTotals(
      [item()],
      exclusive11,
      { mode: "PERCENT", value: "10" },
      [extra()],
    );
    // 1.000.000 + 2 x 500.000 = 2.000.000; 10% = 200.000; net 1.800.000; tax 198.000.
    expect(totals).toMatchObject({
      subtotal: 2_000_000,
      headerDiscountAmount: 200_000,
      taxAmount: 198_000,
      totalAmount: 1_998_000,
    });
  });

  it("simple additional item: 100.000 x 1 = 100.000", () => {
    const totals = previewTotals(
      [item({ qty: "3", unitPrice: "500000" })],
      null,
      null,
      [extra({ qty: "1", unitPrice: "100000", unitLabel: "paket" })],
    );
    // 3 x 500.000 calibration + 100.000 = 1.600.000
    expect(totals.subtotal).toBe(1_600_000);
  });

  it("people x days: 100.000 x 3 orang x 2 hari = 600.000", () => {
    const totals = previewTotals([item({ unitPrice: "0" })], null, null, [
      extra({
        unitPrice: "100000",
        qty: "3",
        unitLabel: "orang",
        multiplier: "2",
        multiplierLabel: "hari",
      }),
    ]);
    expect(totals.subtotal).toBe(600_000);
  });

  it("multiple additional items + the header discount: 600.000 + 300.000 = 900.000, 10% = 90.000, total 810.000", () => {
    const transport = extra({
      key: "t",
      description: "Biaya transport",
      unitPrice: "100000",
      qty: "3",
      unitLabel: "orang",
      multiplier: "2",
      multiplierLabel: "hari",
    });
    const lunch = extra({
      key: "l",
      description: "Makan siang",
      unitPrice: "50000",
      qty: "3",
      unitLabel: "orang",
      multiplier: "2",
      multiplierLabel: "hari",
    });
    const totals = previewTotals([item({ unitPrice: "0" })], null, { mode: "PERCENT", value: "10" }, [
      transport,
      lunch,
    ]);
    expect(totals).toMatchObject({
      subtotal: 900_000,
      headerDiscountAmount: 90_000,
      headerDiscountPercent: 10,
      totalAmount: 810_000,
    });
  });

  it("the totals block lists EACH additional cost by its own name with its calculation", () => {
    const lines = additionalTotalsLines([
      extra({
        key: "t",
        description: "Biaya transport",
        unitPrice: "100000",
        qty: "3",
        unitLabel: "orang",
        multiplier: "2",
        multiplierLabel: "hari",
      }),
      extra({
        key: "l",
        description: "Makan siang",
        unitPrice: "50000",
        qty: "3",
        unitLabel: "orang",
        multiplier: "2",
        multiplierLabel: "hari",
      }),
    ]);
    expect(lines.map((line) => line.description)).toEqual(["Biaya transport", "Makan siang"]);
    expect(lines.map((line) => line.amount)).toEqual([600_000, 300_000]);
    expect(lines[0]!.calculation).toMatch(/× 3 orang × 2 hari$/);
    // Never one anonymous aggregate.
    expect(lines.some((line) => line.description === "Additional Cost")).toBe(false);
  });

  it("uses the stored snapshot amount for saved documents (no recalculation from the catalog)", () => {
    const [line] = additionalTotalsLines([
      {
        id: "row-1",
        description: "Biaya transport",
        unitLabel: "orang",
        qty: "3.0000",
        multiplier: "2.0000",
        multiplierLabel: "hari",
        unitPrice: "100000.00",
        lineTotal: "600000.00",
      },
    ]);
    expect(line!.amount).toBe("600000.00");
    expect(line!.calculation).toContain("3 orang × 2 hari");
  });

  it("line discounts reduce each line before the header discount", () => {
    const totals = previewTotals(
      [item({ discountAmount: "100000" })],
      null,
      { mode: "PERCENT", value: "10" },
      [extra()],
    );
    // Calibration lines keep their line discount; additional lines have none.
    // (1.000.000 - 100.000) + 2 x 500.000 = 1.900.000
    expect(totals.subtotal).toBe(1_900_000);
    expect(totals.headerDiscountAmount).toBe(190_000);
  });
});

describe("discount input mode — which field is the source", () => {
  it("shows the typed text in the source field and the derived value in the other", () => {
    const percentSource = { mode: "PERCENT", value: "10" } as const;
    const totals = previewTotals([item()], null, percentSource);
    expect(discountEditorTexts(percentSource, totals)).toEqual({
      percentText: "10",
      amountText: "100000",
    });

    const amountSource = { mode: "AMOUNT", value: "250000" } as const;
    expect(discountEditorTexts(amountSource, previewTotals([item()], null, amountSource))).toEqual({
      percentText: "25",
      amountText: "250000",
    });
  });

  it("the derived text follows later subtotal changes while the source stays as typed", () => {
    const discount = { mode: "PERCENT", value: "10" } as const;
    const after = previewTotals([item({ unitPrice: "2000000" })], null, discount);
    expect(discountEditorTexts(discount, after)).toEqual({ percentText: "10", amountText: "200000" });
  });

  it("leaves the derived field blank for an empty or invalid source", () => {
    const empty = { mode: "PERCENT", value: "" } as const;
    expect(discountEditorTexts(empty, previewTotals([item()], null, empty))).toEqual({
      percentText: "",
      amountText: "",
    });
    const bad = { mode: "AMOUNT", value: "9999999" } as const;
    expect(discountEditorTexts(bad, previewTotals([item()], null, bad)).percentText).toBe("");
  });

  it("sends ONLY the field the user typed", () => {
    expect(discountPayload({ mode: "PERCENT", value: "12.5" })).toEqual({ headerDiscountPercent: 12.5 });
    expect(discountPayload({ mode: "AMOUNT", value: "100000" })).toEqual({
      headerDiscountAmount: 100_000,
    });
  });

  it("restores the persisted source when a saved quotation is reloaded", () => {
    expect(
      discountInputFromQuotation({
        headerDiscountInputMode: "PERCENT",
        headerDiscountPercent: "10.0000",
        headerDiscountAmount: "100000.00",
      }),
    ).toEqual({ mode: "PERCENT", value: "10" });
    expect(
      discountInputFromQuotation({
        headerDiscountInputMode: "AMOUNT",
        headerDiscountPercent: "10.0000",
        headerDiscountAmount: "100000.00",
      }),
    ).toEqual({ mode: "AMOUNT", value: "100000" });
  });
});

describe("additional items form helpers", () => {
  it("builds the wire shape (id only for existing rows, blank notes -> null)", () => {
    const payload = additionalItemsPayload([
      extra({ id: "row-1", notes: "  " }),
      extra({ key: "k2", description: " ", notes: "2 teknisi" }),
    ]);
    expect(payload[0]).toMatchObject({
      id: "row-1",
      additionalItemTypeId: "type-1",
      qty: 2,
      unitPrice: 500_000,
      notes: null,
    });
    expect(payload[1]).not.toHaveProperty("id");
    expect(payload[1]).toMatchObject({ description: undefined, notes: "2 teknisi" });
    // No line discount and no client-computed amount are ever sent.
    for (const row of payload) {
      expect(row).not.toHaveProperty("discountAmount");
      expect(row).not.toHaveProperty("lineTotal");
      expect(row).not.toHaveProperty("multiplier"); // simple qty line
    }
  });

  it("sends the second multiplier only for a type that has one", () => {
    const [row] = additionalItemsPayload([
      extra({ multiplier: "2", multiplierLabel: "hari", qty: "3", unitLabel: "orang" }),
    ]);
    expect(row).toMatchObject({ qty: 3, multiplier: 2 });
  });

  it("validates type, qty, price and discount before submit", () => {
    expect(validateAdditionalItems([])).toBeNull();
    expect(validateAdditionalItems([extra()])).toBeNull();
    expect(validateAdditionalItems([extra({ additionalItemTypeId: "" })])).toMatch(/pilih jenis/);
    expect(validateAdditionalItems([extra({ qty: "0" })])).toMatch(/qty/);
    expect(validateAdditionalItems([extra({ qty: "1.5" })])).toMatch(/qty/);
    expect(validateAdditionalItems([extra({ unitPrice: "" })])).toMatch(/unit price/);
    expect(
      validateAdditionalItems([extra({ multiplierLabel: "hari", multiplier: "0" })]),
    ).toMatch(/hari/);
    expect(
      validateAdditionalItems([extra({ multiplierLabel: "hari", multiplier: "2" })]),
    ).toBeNull();
  });
});

describe("quotation date helpers", () => {
  it("todayIsoJakarta is the Asia/Jakarta calendar day (UTC+7)", () => {
    expect(todayIsoJakarta(new Date("2026-09-30T16:59:59.000Z"))).toBe("2026-09-30");
    expect(todayIsoJakarta(new Date("2026-09-30T17:00:00.000Z"))).toBe("2026-10-01");
  });

  it("date-only values are formatted in UTC so the viewer time zone cannot shift the day", () => {
    expect(formatDateOnly("2026-03-15T00:00:00.000Z")).toContain("15");
    expect(formatDateOnly(null)).toBe("—");
  });

  it("the PDF filename follows the quotation date", () => {
    expect(
      quotationPdfFilenameForRow({
        number: "QUO/2026/03/00007",
        companyId: "PKM",
        quotationDate: "2026-03-15T00:00:00.000Z",
      }),
    ).toBe("PKM-QUO-20260315-00007.pdf");
  });
});
