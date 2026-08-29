import { existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { Company, Prisma } from "@medcal/db";
import {
  QUOTATION_LETTERHEAD_ADDRESS_LINES,
  quotationAddresseeLine,
  quotationPdfFilename,
} from "../quotations/quotation-pdf";

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

export type PurchaseOrderPdfSource = {
  number: string;
  createdAt: Date;
  customerPoNumber: string;
  customerPoDate: Date;
  notes: string | null;
  subtotal: Prisma.Decimal | string | number;
  headerDiscountAmount: Prisma.Decimal | string | number;
  taxAmount: Prisma.Decimal | string | number;
  totalAmount: Prisma.Decimal | string | number;
  taxCode: string;
  taxRate: Prisma.Decimal | string | number;
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
  quotation: {
    number: string;
    request?: { number: string } | null;
  };
  items: Array<{
    description: string;
    qty: Prisma.Decimal | string | number;
    unitPrice: Prisma.Decimal | string | number;
    discountAmount: Prisma.Decimal | string | number;
    lineTotal: Prisma.Decimal | string | number;
    quotationItem: {
      requestItem: {
        deviceId: string | null;
        deviceType: { name: string };
      } | null;
    } | null;
  }>;
};

export type PurchaseOrderPdfResult = {
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

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function line(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function purchaseOrderPdfFilename(input: {
  number: string;
  companyId: string;
  issuedAt: Date | string;
}): string {
  return quotationPdfFilename(input);
}

export function renderPurchaseOrderPdf(input: {
  purchaseOrder: PurchaseOrderPdfSource;
  company: Company;
}): Promise<PurchaseOrderPdfResult> {
  const { purchaseOrder, company } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: purchaseOrderPdfFilename({
          number: purchaseOrder.number,
          companyId: company.id,
          issuedAt: purchaseOrder.createdAt,
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
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text("PURCHASE ORDER", 50, y);
    y = doc.y + 8;
    doc.font("Helvetica").fontSize(10);
    doc.text(`PO Number: ${purchaseOrder.number}`, 50, y);
    y = doc.y;
    doc.text(`Tanggal: ${formatDate(purchaseOrder.createdAt)}`, 50, y);
    y = doc.y;
    doc.text(`Customer PO No: ${purchaseOrder.customerPoNumber}`, 50, y);
    y = doc.y;
    doc.text(`Customer PO Date: ${formatDate(purchaseOrder.customerPoDate)}`, 50, y);
    y = doc.y + 12;

    doc.font("Helvetica-Bold").fontSize(10).text("Kepada", 50, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
    doc.text(quotationAddresseeLine(purchaseOrder.customer), 50, y, { width: pageWidth });
    y = doc.y;

    y += 10;
    doc.font("Helvetica").fontSize(10);
    doc.text(`Quotation: ${purchaseOrder.quotation.number}`, 50, y);
    y = doc.y;
    if (purchaseOrder.quotation.request?.number) {
      doc.text(`Calibration Requisition: ${purchaseOrder.quotation.request.number}`, 50, y);
      y = doc.y;
    }
    y += 14;

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
    for (const item of purchaseOrder.items) {
      const deviceName = item.quotationItem?.requestItem?.deviceType.name;
      const deviceId = item.quotationItem?.requestItem?.deviceId;
      const descLines = [item.description];
      if (deviceName && deviceName !== item.description) descLines.push(deviceName);
      if (deviceId) descLines.push(`Device ID: ${deviceId}`);

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

    y += 4;
    doc.moveTo(320, y).lineTo(545, y).strokeColor("#e2e8f0").stroke();
    y += 10;

    const totalsX = 370;
    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text("Subtotal", totalsX, y, { width: 80 });
    doc.fillColor("#0f172a").text(formatIdr(purchaseOrder.subtotal), totalsX + 80, y, {
      width: 95,
      align: "right",
    });
    y = doc.y + 4;

    doc.fillColor("#334155").text("Discount", totalsX, y, { width: 80 });
    doc.fillColor("#0f172a").text(formatIdr(purchaseOrder.headerDiscountAmount), totalsX + 80, y, {
      width: 95,
      align: "right",
    });
    y = doc.y + 4;

    if (purchaseOrder.taxCode || purchaseOrder.taxAmount != null) {
      const rate = moneyNumber(purchaseOrder.taxRate);
      const rateLabel =
        purchaseOrder.taxCode && rate > 0
          ? ` ${new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 2 }).format(rate)}`
          : "";
      const taxLabel = purchaseOrder.taxCode ? `Tax (${purchaseOrder.taxCode}${rateLabel})` : "Tax";
      doc.fillColor("#334155").text(taxLabel, totalsX, y, { width: 80 });
      doc.fillColor("#0f172a").text(formatIdr(purchaseOrder.taxAmount), totalsX + 80, y, {
        width: 95,
        align: "right",
      });
      y = doc.y + 4;
    }

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Total", totalsX, y, { width: 80 });
    doc.text(formatIdr(purchaseOrder.totalAmount), totalsX + 80, y, {
      width: 95,
      align: "right",
    });

    if (purchaseOrder.notes?.trim()) {
      y = doc.y + 16;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("Notes", 50, y);
      y = doc.y + 2;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#334155")
        .text(purchaseOrder.notes.trim(), 50, y, {
          width: pageWidth,
        });
    }

    doc.end();
  });
}
