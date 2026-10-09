import { existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { Company, Prisma } from "@medcal/db";
import { describeAdditionalCalculation } from "@medcal/shared";

/** Quotation letterhead address — two lines, as used on the printed document. */
export const QUOTATION_LETTERHEAD_ADDRESS_LINES = [
  "Graha Bumi Indah-LT 3, Jl. Raya Kalimalang, Kav. Agraria Blok E No. 10,",
  "Duren Sawit, Jakarta Timur, 13440",
] as const;

const LETTERHEAD_LOGO_WIDTH = 120;
const LETTERHEAD_LOGO_MAX_HEIGHT = 56;

function resolveLetterheadLogoPath(): string | null {
  const candidates = [
    join(__dirname, "../../../assets/logo.png"),
    join(process.cwd(), "assets/logo.png"),
    join(process.cwd(), "../portal/public/logo.png"),
    join(process.cwd(), "../web/public/logo.png"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Snapshot of one commercial additional item as printed. Everything shown comes
 * from the quotation's / PO's own snapshot columns - never from the live catalog.
 */
export type PdfAdditionalItem = {
  description: string;
  unitLabel: string;
  qty: Prisma.Decimal | string | number;
  multiplier?: Prisma.Decimal | string | number | null;
  multiplierLabel?: string | null;
  unitPrice: Prisma.Decimal | string | number;
  lineTotal: Prisma.Decimal | string | number;
  notes?: string | null;
};

export type QuotationPdfSource = {
  number: string;
  /** Business date (date-only, UTC midnight of the calendar day) — printed as "Tanggal". */
  quotationDate: Date;
  validUntil: Date | null;
  /** Free-text remarks, printed under the totals when present. */
  notes?: string | null;
  subtotal: Prisma.Decimal | string | number;
  headerDiscountAmount: Prisma.Decimal | string | number;
  /** Percent representation of the header discount; printed next to the amount when > 0. */
  headerDiscountPercent?: Prisma.Decimal | string | number | null;
  taxAmount: Prisma.Decimal | string | number;
  totalAmount: Prisma.Decimal | string | number;
  taxCode: string;
  taxRate: Prisma.Decimal | string | number;
  /**
   * `Tax.isExclude` of the document's tax, resolved live from the Tax master via
   * `taxCode` (never snapshotted on the Quotation). `false` = Include: the tax is
   * already inside Total, so the separate tax line is not printed. `true` =
   * Exclude, and `null`/undefined (tax no longer resolvable) both print the line
   * exactly as before.
   */
  taxIsExclude?: boolean | null;
  customer: {
    name: string;
    number: string;
    legalName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
    contacts?: Array<{
      name: string;
      isPrimary: boolean;
    }>;
  };
  request: { number: string };
  items: Array<{
    description: string;
    qty: Prisma.Decimal | string | number;
    unitPrice: Prisma.Decimal | string | number;
    discountAmount: Prisma.Decimal | string | number;
    lineTotal: Prisma.Decimal | string | number;
    requestItem: {
      deviceId: string | null;
      /** Customer's own wording for the device — printed above the master name (MoM #3). */
      customerDeviceName?: string | null;
      deviceType: { name: string };
    } | null;
  }>;
  /** Commercial additional items (snapshot lines), printed after the calibration lines. */
  additionalItems?: PdfAdditionalItem[];
};

export type QuotationPdfResult = {
  buffer: Buffer;
  filename: string;
};

function moneyNumber(value: Prisma.Decimal | string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatIdr(value: Prisma.Decimal | string | number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(moneyNumber(value));
}

/** Date-only values (quotation date, valid-until) are UTC midnight: format in UTC so the server time zone can never shift the day. */
function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Discount" or "Discount (12,5%)" when a percentage is recorded. */
export function discountLabel(percent: Prisma.Decimal | string | number | null | undefined): string {
  const value = moneyNumber(percent);
  if (!(value > 0)) return "Discount";
  const text = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(value);
  return `Discount (${text}%)`;
}

function line(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function quotationAddresseeLine(customer: {
  contacts?: Array<{ name: string; isPrimary?: boolean }> | null;
}): string {
  const contacts = customer.contacts ?? [];
  const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0];
  const name = primary?.name?.trim();
  if (!name) return "Contact person belum terdaftar";
  return `Bapak/Ibu ${name}`;
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

/**
 * Device name block for one printed line: the customer-given alias reads first,
 * the MEDCAL master name underneath it (MoM #3). A name equal to a line already
 * in the block is dropped, so the same wording is never printed twice on a row.
 */
export function deviceDescriptionLines(input: {
  description: string;
  customerDeviceName?: string | null;
  deviceTypeName?: string | null;
}): string[] {
  const lines = [input.description];
  for (const name of [input.customerDeviceName, input.deviceTypeName]) {
    const trimmed = name?.trim();
    if (trimmed && !lines.includes(trimmed)) lines.push(trimmed);
  }
  return lines;
}

/**
 * The tax breakdown line is printed unless the document's tax is in Include mode
 * (`Tax.isExclude === false`), where the tax already sits inside Total and a
 * separate line would double-state it. An unknown tax mode (`null`/undefined)
 * keeps the previous behaviour.
 */
export function shouldRenderTaxLine(quotation: {
  taxCode?: string | null;
  taxAmount?: Prisma.Decimal | string | number | null;
  taxIsExclude?: boolean | null;
}): boolean {
  if (quotation.taxIsExclude === false) return false;
  return Boolean(quotation.taxCode) || quotation.taxAmount != null;
}

/** "Rp100.000 × 3 orang × 2 hari" — the same wording the portal shows. */
export function additionalCalculationText(item: PdfAdditionalItem): string {
  return describeAdditionalCalculation(formatIdr(item.unitPrice), {
    qty: Number(item.qty),
    unitLabel: item.unitLabel,
    multiplier: item.multiplier == null ? null : Number(item.multiplier),
    multiplierLabel: item.multiplierLabel,
  });
}

type PdfDoc = InstanceType<typeof PDFDocument>;

const ADDITIONAL_COLS = { desc: 50, total: 450 } as const;

/**
 * "BIAYA TAMBAHAN" block: each additional item on its own row with its name, its
 * calculation ("Rp100.000 × 3 orang × 2 hari") and its amount. Returns the new y.
 */
export function renderAdditionalItemsSection(
  doc: PdfDoc,
  items: PdfAdditionalItem[],
  startY: number,
): number {
  if (items.length === 0) return startY;
  let y = startY;
  if (y + 40 > doc.page.height - 80) {
    doc.addPage();
    y = 50;
  }
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
  doc.text("BIAYA TAMBAHAN", ADDITIONAL_COLS.desc, y, { width: 195 });
  y = doc.y + 6;
  doc.fillColor("#0f172a").font("Helvetica").fontSize(9);
  for (const item of items) {
    const lines = [item.description, additionalCalculationText(item)];
    if (item.notes) lines.push(item.notes);
    const text = lines.join("\n");
    const height = doc.heightOfString(text, { width: 300 });
    if (y + height > doc.page.height - 80) {
      doc.addPage();
      y = 50;
    }
    doc.text(text, ADDITIONAL_COLS.desc, y, { width: 300 });
    doc.text(formatIdr(item.lineTotal), ADDITIONAL_COLS.total, y, { width: 95, align: "right" });
    y += Math.max(height, 16) + 8;
  }
  return y;
}

/** Totals layout: ONE label column (left-aligned) and ONE amount column (right-aligned). */
export const TOTALS_LABEL_X = 320; // lines up with the divider drawn above the totals
export const TOTALS_LABEL_WIDTH = 125;
export const TOTALS_VALUE_X = 450;
export const TOTALS_VALUE_WIDTH = 95;

export interface PdfTotalsInput {
  subtotal: Prisma.Decimal | string | number;
  headerDiscountPercent?: Prisma.Decimal | string | number | null;
  headerDiscountAmount: Prisma.Decimal | string | number;
  /** Commercial additional items inside `subtotal` (each listed by its own name). */
  additionalItems: PdfAdditionalItem[];
  /** null = no tax row (inclusive / no tax). */
  tax: { label: string; amount: Prisma.Decimal | string | number } | null;
  total: Prisma.Decimal | string | number;
}

/**
 * Cut `text` to fit `width` at the current font, appending "...". PDFKit's own
 * `ellipsis` option only works together with a fixed `height`, so without this a
 * long label silently wraps onto extra lines and overlaps the rows below it.
 */
function fitToWidth(doc: PdfDoc, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.widthOfString(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

function renderTotalsRow(
  doc: PdfDoc,
  label: string,
  amount: Prisma.Decimal | string | number,
  y: number,
  bold = false,
): void {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10);
  // Long labels (e.g. an additional-cost name) are truncated to the column, never wrapped, so a
  // label can neither overlap its amount nor push the following rows down.
  doc.fillColor(bold ? "#0f172a" : "#334155").text(
    fitToWidth(doc, label, TOTALS_LABEL_WIDTH),
    TOTALS_LABEL_X,
    y,
    { width: TOTALS_LABEL_WIDTH, lineBreak: false },
  );
  doc.fillColor("#0f172a").text(formatIdr(amount), TOTALS_VALUE_X, y, {
    width: TOTALS_VALUE_WIDTH,
    align: "right",
  });
}

/**
 * Totals block shared by the quotation and PO PDFs:
 *
 *   Subtotal Kalibrasi     (only when there are additional items)
 *   <additional cost name> (one row per additional item, by its own name)
 *   Subtotal
 *   Discount [(10%)]
 *   Tax (...)              (only when applicable)
 *   Total                  (bold)
 *
 * Presentation only: every figure is passed in (nothing is recalculated except the
 * calibration-only subtotal, which is the stored subtotal minus the additional lines).
 * Returns the y just below the Total row.
 */
export function renderTotalsBlock(doc: PdfDoc, totals: PdfTotalsInput, startY: number): number {
  let y = startY;
  const additionalSum = totals.additionalItems.reduce(
    (sum, item) => sum + moneyNumber(item.lineTotal),
    0,
  );
  if (totals.additionalItems.length > 0) {
    renderTotalsRow(doc, "Subtotal Kalibrasi", moneyNumber(totals.subtotal) - additionalSum, y);
    y = doc.y + 4;
    for (const item of totals.additionalItems) {
      renderTotalsRow(doc, item.description, item.lineTotal, y);
      y = doc.y + 4;
    }
  }
  renderTotalsRow(doc, "Subtotal", totals.subtotal, y);
  y = doc.y + 4;
  renderTotalsRow(doc, discountLabel(totals.headerDiscountPercent), totals.headerDiscountAmount, y);
  y = doc.y + 4;
  if (totals.tax) {
    renderTotalsRow(doc, totals.tax.label, totals.tax.amount, y);
    y = doc.y + 4;
  }
  renderTotalsRow(doc, "Total", totals.total, y, true);
  return doc.y;
}

export function renderQuotationPdf(input: {
  quotation: QuotationPdfSource;
  company: Company;
}): Promise<QuotationPdfResult> {
  const { quotation, company } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: quotationPdfFilename({
          number: quotation.number,
          companyId: company.id,
          issuedAt: quotation.quotationDate,
        }),
      });
    });

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.y;

    const logoPath = resolveLetterheadLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, 50, y, {
          fit: [LETTERHEAD_LOGO_WIDTH, LETTERHEAD_LOGO_MAX_HEIGHT],
        });
        y += LETTERHEAD_LOGO_MAX_HEIGHT + 10;
      } catch {
        // Continue without logo if the image cannot be embedded.
      }
    }

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text(company.name, 50, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    for (const value of [
      line(company.legalName),
      ...QUOTATION_LETTERHEAD_ADDRESS_LINES,
      [line(company.phone), line(company.email)].filter(Boolean).join(" · ") || null,
      company.taxId ? `NPWP ${company.taxId}` : null,
    ]) {
      if (!value) continue;
      doc.text(value, 50, y, { width: pageWidth });
      y = doc.y;
    }

    y += 16;
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text("QUOTATION", 50, y);
    y = doc.y + 8;
    doc.font("Helvetica").fontSize(10);
    doc.text(`Nomor: ${quotation.number}`, 50, y);
    y = doc.y;
    doc.text(`Tanggal: ${formatDate(quotation.quotationDate)}`, 50, y);
    y = doc.y;
    doc.text(`Berlaku hingga: ${formatDate(quotation.validUntil)}`, 50, y);
    y = doc.y + 12;

    doc.font("Helvetica-Bold").fontSize(10).text("Kepada", 50, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
    doc.text(quotationAddresseeLine(quotation.customer), 50, y, { width: pageWidth });
    y = doc.y;

    y += 10;
    doc.font("Helvetica").fontSize(10);
    doc.text(`Calibration Requisition: ${quotation.request.number}`, 50, y);
    y = doc.y + 14;

    const cols = {
      desc: 50,
      qty: 250,
      unit: 290,
      disc: 370,
      total: 450,
    };
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
    doc.text("DESKRIPSI", cols.desc, y, { width: 195 });
    doc.text("QTY", cols.qty, y, { width: 35, align: "right" });
    doc.text("HARGA SATUAN", cols.unit, y, { width: 75, align: "right" });
    doc.text("DISKON", cols.disc, y, { width: 75, align: "right" });
    doc.text("JUMLAH", cols.total, y, { width: 95, align: "right" });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e2e8f0").stroke();
    y += 8;

    doc.fillColor("#0f172a").font("Helvetica").fontSize(9);
    for (const item of quotation.items) {
      const deviceId = item.requestItem?.deviceId;
      const descLines = deviceDescriptionLines({
        description: item.description,
        customerDeviceName: item.requestItem?.customerDeviceName,
        deviceTypeName: item.requestItem?.deviceType.name,
      });
      if (deviceId) descLines.push(`Serial No: ${deviceId}`);

      const descHeight = doc.heightOfString(descLines.join("\n"), { width: 195 });
      if (y + descHeight > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }

      doc.text(descLines.join("\n"), cols.desc, y, { width: 195 });
      const rowY = y;
      doc.text(String(item.qty), cols.qty, rowY, { width: 35, align: "right" });
      doc.text(formatIdr(item.unitPrice), cols.unit, rowY, { width: 75, align: "right" });
      doc.text(formatIdr(item.discountAmount), cols.disc, rowY, { width: 75, align: "right" });
      doc.text(formatIdr(item.lineTotal), cols.total, rowY, { width: 95, align: "right" });
      y += Math.max(descHeight, 16) + 8;
    }

    const additionalItems = quotation.additionalItems ?? [];
    y = renderAdditionalItemsSection(doc, additionalItems, y);

    y += 4;
    doc.moveTo(320, y).lineTo(545, y).strokeColor("#e2e8f0").stroke();
    y += 10;

    const rate = moneyNumber(quotation.taxRate);
    const rateLabel =
      quotation.taxCode && rate > 0
        ? ` ${new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 2 }).format(rate)}`
        : "";
    y = renderTotalsBlock(
      doc,
      {
        subtotal: quotation.subtotal,
        headerDiscountPercent: quotation.headerDiscountPercent,
        headerDiscountAmount: quotation.headerDiscountAmount,
        additionalItems,
        tax: shouldRenderTaxLine(quotation)
          ? {
              label: quotation.taxCode ? `Tax (${quotation.taxCode}${rateLabel})` : "Tax",
              amount: quotation.taxAmount,
            }
          : null,
        total: quotation.totalAmount,
      },
      y,
    );

    if (quotation.notes?.trim()) {
      y = doc.y + 16;
      if (y + 60 > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("Catatan", 50, y);
      y = doc.y + 2;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#334155")
        .text(quotation.notes.trim(), 50, y, { width: pageWidth });
    }

    doc.end();
  });
}
