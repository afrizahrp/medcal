import { describe, expect, it } from "vitest";
import {
  deviceDescriptionLines,
  discountLabel,
  quotationAddresseeLine,
  quotationPdfFilename,
  shouldRenderTaxLine,
  TOTALS_LABEL_WIDTH,
  TOTALS_LABEL_X,
  TOTALS_VALUE_WIDTH,
  TOTALS_VALUE_X,
  renderTotalsBlock,
} from "./quotation-pdf";

describe("quotationAddresseeLine", () => {
  it("uses Bapak/Ibu and the primary contact name", () => {
    expect(
      quotationAddresseeLine({
        contacts: [
          { name: "Andi Wijaya", isPrimary: false },
          { name: "Siti Rahayu", isPrimary: true },
        ],
      }),
    ).toBe("Bapak/Ibu Siti Rahayu");
  });

  it("falls back to the first contact when none is primary", () => {
    expect(
      quotationAddresseeLine({
        contacts: [{ name: "Andi Wijaya", isPrimary: false }],
      }),
    ).toBe("Bapak/Ibu Andi Wijaya");
  });

  it("does not substitute the company name when no contact exists", () => {
    expect(quotationAddresseeLine({ contacts: [] })).toBe("Contact person belum terdaftar");
  });
});

describe("quotationPdfFilename", () => {
  it("formats PKM-QUO-YYYYMMDD-sequence from the quotation number and issue date", () => {
    expect(
      quotationPdfFilename({
        number: "QUO/2026/08/00001",
        companyId: "PKM",
        issuedAt: "2026-08-27T03:00:00.000Z",
      }),
    ).toBe("PKM-QUO-20260827-00001.pdf");
  });
});

describe("quotationPdfFilename — quotation date", () => {
  it("uses the date-only quotation date (UTC midnight), never a time-of-day shifted day", () => {
    expect(
      quotationPdfFilename({
        number: "QUO/2026/03/00007",
        companyId: "PKM",
        issuedAt: new Date("2026-03-15T00:00:00.000Z"),
      }),
    ).toBe("PKM-QUO-20260315-00007.pdf");
  });
});

describe("discountLabel", () => {
  it("prints a plain label when no percentage is recorded", () => {
    expect(discountLabel(0)).toBe("Discount");
    expect(discountLabel(null)).toBe("Discount");
    expect(discountLabel("0.0000")).toBe("Discount");
  });

  it("prints the percentage next to the label when present", () => {
    expect(discountLabel("10.0000")).toBe("Discount (10%)");
    expect(discountLabel(12.5)).toBe("Discount (12,5%)");
    expect(discountLabel("33.3333")).toBe("Discount (33,3333%)");
  });
});

describe("shouldRenderTaxLine", () => {
  it("hides the tax line when the tax is Include (isExclude false) — total is already inclusive", () => {
    expect(
      shouldRenderTaxLine({ taxCode: "T2", taxAmount: 99000, taxIsExclude: false }),
    ).toBe(false);
  });

  it("keeps the tax line when the tax is Exclude", () => {
    expect(shouldRenderTaxLine({ taxCode: "T1", taxAmount: 99000, taxIsExclude: true })).toBe(true);
  });

  it("keeps the tax line when the tax mode is unknown (code no longer resolvable)", () => {
    expect(shouldRenderTaxLine({ taxCode: "T1", taxAmount: 99000, taxIsExclude: null })).toBe(true);
    expect(shouldRenderTaxLine({ taxCode: "T1", taxAmount: 99000 })).toBe(true);
  });

  it("hides the tax line when there is no tax at all, as before", () => {
    expect(shouldRenderTaxLine({ taxCode: "", taxAmount: null })).toBe(false);
  });
});

describe("deviceDescriptionLines", () => {
  it("prints the customer alias above the master device name", () => {
    expect(
      deviceDescriptionLines({
        description: "Kalibrasi Tensimeter",
        customerDeviceName: "tensimeter digital",
        deviceTypeName: "Blood Pressure Monitor",
      }),
    ).toEqual(["Kalibrasi Tensimeter", "tensimeter digital", "Blood Pressure Monitor"]);
  });

  it("prints the master name alone when there is no alias, as before", () => {
    expect(
      deviceDescriptionLines({
        description: "Kalibrasi Tensimeter",
        deviceTypeName: "Blood Pressure Monitor",
      }),
    ).toEqual(["Kalibrasi Tensimeter", "Blood Pressure Monitor"]);
  });

  it("never repeats a name that already reads as the line description", () => {
    expect(
      deviceDescriptionLines({
        description: "Blood Pressure Monitor",
        customerDeviceName: "Blood Pressure Monitor",
        deviceTypeName: "Blood Pressure Monitor",
      }),
    ).toEqual(["Blood Pressure Monitor"]);
  });
});

// -----------------------------------------------------------------------------
// Totals block layout (shared by the quotation and PO PDFs)
// -----------------------------------------------------------------------------

interface TextCall {
  text: string;
  x: number;
  y: number;
  opts: { width?: number; align?: string; lineBreak?: boolean; ellipsis?: boolean };
  font: string;
}

/** A recording stand-in for the PDFKit document: captures every text() call and advances y. */
function recordingDoc() {
  const calls: TextCall[] = [];
  let font = "Helvetica";
  let y = 0;
  const doc = {
    get y() {
      return y;
    },
    font(name: string) {
      font = name;
      return doc;
    },
    fontSize() {
      return doc;
    },
    fillColor() {
      return doc;
    },
    // Stand-in metric: 5 pt per character (Helvetica 10 is ~5 pt average).
    widthOfString(text: string) {
      return text.length * 5;
    },
    text(text: string, x: number, atY: number, opts: TextCall["opts"] = {}) {
      calls.push({ text, x, y: atY, opts, font });
      y = atY + 12;
      return doc;
    },
  };
  return { doc, calls };
}

function totalsRows(calls: TextCall[]) {
  // calls come in (label, amount) pairs
  const rows: Array<{ label: TextCall; amount: TextCall }> = [];
  for (let i = 0; i < calls.length; i += 2) rows.push({ label: calls[i]!, amount: calls[i + 1]! });
  return rows;
}

const additional = (description: string, lineTotal: number) => ({
  description,
  unitLabel: "orang",
  qty: 3,
  multiplier: 2,
  multiplierLabel: "hari",
  unitPrice: lineTotal / 6,
  lineTotal,
});

function renderTotals(
  additionalItems: ReturnType<typeof additional>[],
  extra: { subtotal: number; discount?: number; percent?: number; tax?: number; total: number },
) {
  const { doc, calls } = recordingDoc();
  const endY = renderTotalsBlock(
    doc as never,
    {
      subtotal: extra.subtotal,
      headerDiscountAmount: extra.discount ?? 0,
      headerDiscountPercent: extra.percent ?? 0,
      additionalItems,
      tax: extra.tax === undefined ? null : { label: "Tax (PPN 11%)", amount: extra.tax },
      total: extra.total,
    },
    100,
  );
  return { rows: totalsRows(calls), endY };
}

describe("renderTotalsBlock — label/amount alignment", () => {
  it("no additional items: Subtotal / Discount / Total, no calibration-subtotal row", () => {
    const { rows } = renderTotals([], { subtotal: 3_000_000, total: 3_000_000 });
    expect(rows.map((row) => row.label.text)).toEqual(["Subtotal", "Discount", "Total"]);
  });

  it("one additional item: Subtotal Kalibrasi / <name> / Subtotal / Discount / Total", () => {
    const { rows } = renderTotals([additional("Biaya transport", 100_000)], {
      subtotal: 3_100_000,
      total: 3_100_000,
    });
    expect(rows.map((row) => row.label.text)).toEqual([
      "Subtotal Kalibrasi",
      "Biaya transport",
      "Subtotal",
      "Discount",
      "Total",
    ]);
    // Subtotal Kalibrasi = stored subtotal minus the additional lines (3.100.000 - 100.000).
    expect(rows[0]!.amount.text.replace(/\D/g, "")).toBe("3000000");
    expect(rows[1]!.amount.text.replace(/\D/g, "")).toBe("100000");
    expect(rows[2]!.amount.text.replace(/\D/g, "")).toBe("3100000");
    expect(rows[3]!.amount.text.replace(/\D/g, "")).toBe("0");
    expect(rows[4]!.amount.text.replace(/\D/g, "")).toBe("3100000");
  });

  it("every label shares one left-aligned column and every amount one right-aligned column (zero, one, many)", () => {
    const scenarios = [
      renderTotals([], { subtotal: 1_000_000, discount: 100_000, percent: 10, tax: 99_000, total: 999_000 }),
      renderTotals([additional("Biaya transport", 600_000)], { subtotal: 1_600_000, total: 1_600_000 }),
      renderTotals(
        [
          additional("Biaya transport", 600_000),
          additional("Makan siang", 300_000),
          additional("Akomodasi hotel bintang empat dengan sarapan untuk tim teknisi kalibrasi lapangan", 900_000),
        ],
        { subtotal: 2_800_000, discount: 280_000, percent: 10, tax: 277_200, total: 2_797_200 },
      ),
    ];
    for (const { rows } of scenarios) {
      for (const { label, amount } of rows) {
        expect(label.x).toBe(TOTALS_LABEL_X);
        expect(label.opts.width).toBe(TOTALS_LABEL_WIDTH);
        expect(label.opts.align).toBeUndefined(); // left-aligned
        expect(amount.x).toBe(TOTALS_VALUE_X);
        expect(amount.opts.width).toBe(TOTALS_VALUE_WIDTH);
        expect(amount.opts.align).toBe("right");
        expect(amount.y).toBe(label.y); // same baseline
      }
      // The label column ends before the amount column starts: no overlap possible.
      expect(TOTALS_LABEL_X + TOTALS_LABEL_WIDTH).toBeLessThanOrEqual(TOTALS_VALUE_X);
    }
  });

  it("long additional-cost names are truncated to the label column (never wrapped) and rows keep an even vertical step", () => {
    const { rows } = renderTotals(
      [
        additional("Akomodasi hotel bintang empat dengan sarapan untuk tim teknisi kalibrasi lapangan", 900_000),
        additional("Makan siang", 300_000),
      ],
      { subtotal: 1_300_000, total: 1_300_000 },
    );
    const long = rows[1]!.label;
    expect(long.opts.lineBreak).toBe(false);
    expect(long.text.endsWith("...")).toBe(true);
    expect(long.text.length * 5).toBeLessThanOrEqual(TOTALS_LABEL_WIDTH); // fits the column
    expect(long.text.startsWith("Akomodasi hotel")).toBe(true);
    // A name that already fits is printed untouched.
    expect(rows[2]!.label.text).toBe("Makan siang");
    const steps = rows.slice(1).map((row, index) => row.label.y - rows[index]!.label.y);
    expect(new Set(steps).size).toBe(1); // identical spacing between every row
    expect(steps[0]).toBeGreaterThan(0);
  });

  it("Total stays bold; every other row is regular", () => {
    const { rows } = renderTotals([additional("Biaya transport", 100_000)], {
      subtotal: 1_100_000,
      tax: 99_000,
      total: 1_199_000,
    });
    expect(rows.at(-1)!.label.text).toBe("Total");
    expect(rows.at(-1)!.label.font).toBe("Helvetica-Bold");
    expect(rows.at(-1)!.amount.font).toBe("Helvetica-Bold");
    for (const row of rows.slice(0, -1)) expect(row.label.font).toBe("Helvetica");
  });

  it("shows the percentage on the Discount label and a Tax row only when given", () => {
    const withTax = renderTotals([], { subtotal: 1_000_000, discount: 100_000, percent: 10, tax: 99_000, total: 999_000 });
    expect(withTax.rows.map((row) => row.label.text)).toEqual([
      "Subtotal",
      "Discount (10%)",
      "Tax (PPN 11%)",
      "Total",
    ]);
    const noTax = renderTotals([], { subtotal: 1_000_000, total: 1_000_000 });
    expect(noTax.rows.map((row) => row.label.text)).not.toContain("Tax (PPN 11%)");
  });

  it("does not change any figure: amounts are printed exactly as passed in", () => {
    const { rows } = renderTotals([additional("Biaya transport", 600_000)], {
      subtotal: 1_600_000,
      discount: 160_000,
      percent: 10,
      tax: 158_400,
      total: 1_598_400,
    });
    const digits = rows.map((row) => row.amount.text.replace(/\D/g, ""));
    expect(digits).toEqual(["1000000", "600000", "1600000", "160000", "158400", "1598400"]);
  });
});
