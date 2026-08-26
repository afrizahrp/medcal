import { existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { Company, Prisma } from "@medcal/db";

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

export type QuotationPdfSource = {
  number: string;
  createdAt: Date;
  validUntil: Date | null;
  subtotal: Prisma.Decimal | string | number;
  taxAmount: Prisma.Decimal | string | number | null;
  totalAmount: Prisma.Decimal | string | number;
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
  tax: { taxCode: string } | null;
  items: Array<{
    description: string;
    qty: Prisma.Decimal | string | number;
    unitPrice: Prisma.Decimal | string | number;
    lineTotal: Prisma.Decimal | string | number;
    requestItem: {
      deviceId: string;
      deviceType: { name: string };
    } | null;
  }>;
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
          issuedAt: quotation.createdAt,
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
    doc.text(`Tanggal: ${formatDate(quotation.createdAt)}`, 50, y);
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
      qty: 320,
      unit: 370,
      total: 460,
    };
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
    doc.text("DESKRIPSI", cols.desc, y, { width: 260 });
    doc.text("QTY", cols.qty, y, { width: 45, align: "right" });
    doc.text("HARGA SATUAN", cols.unit, y, { width: 85, align: "right" });
    doc.text("JUMLAH", cols.total, y, { width: 85, align: "right" });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e2e8f0").stroke();
    y += 8;

    doc.fillColor("#0f172a").font("Helvetica").fontSize(9);
    for (const item of quotation.items) {
      const deviceName = item.requestItem?.deviceType.name;
      const deviceId = item.requestItem?.deviceId;
      const descLines = [item.description];
      if (deviceName && deviceName !== item.description) descLines.push(deviceName);
      if (deviceId) descLines.push(`Device ID: ${deviceId}`);

      const descHeight = doc.heightOfString(descLines.join("\n"), { width: 260 });
      if (y + descHeight > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }

      doc.text(descLines.join("\n"), cols.desc, y, { width: 260 });
      const rowY = y;
      doc.text(String(item.qty), cols.qty, rowY, { width: 45, align: "right" });
      doc.text(formatIdr(item.unitPrice), cols.unit, rowY, { width: 85, align: "right" });
      doc.text(formatIdr(item.lineTotal), cols.total, rowY, { width: 85, align: "right" });
      y += Math.max(descHeight, 16) + 8;
    }

    y += 4;
    doc.moveTo(320, y).lineTo(545, y).strokeColor("#e2e8f0").stroke();
    y += 10;

    const totalsX = 370;
    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text("Subtotal", totalsX, y, { width: 80 });
    doc.fillColor("#0f172a").text(formatIdr(quotation.subtotal), totalsX + 80, y, {
      width: 95,
      align: "right",
    });
    y = doc.y + 4;

    if (quotation.tax || quotation.taxAmount != null) {
      const taxLabel = quotation.tax ? `Tax (${quotation.tax.taxCode})` : "Tax";
      doc.fillColor("#334155").text(taxLabel, totalsX, y, { width: 80 });
      doc.fillColor("#0f172a").text(formatIdr(quotation.taxAmount), totalsX + 80, y, {
        width: 95,
        align: "right",
      });
      y = doc.y + 4;
    }

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Total", totalsX, y, { width: 80 });
    doc.text(formatIdr(quotation.totalAmount), totalsX + 80, y, {
      width: 95,
      align: "right",
    });

    doc.end();
  });
}
