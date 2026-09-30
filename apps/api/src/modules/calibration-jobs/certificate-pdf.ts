import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { BUSINESS_TIME_ZONE } from "@medcal/db";

/**
 * Everything printed on a Medcal-GENERATED certificate. Rendered strictly from
 * the persisted, already-ISSUED Certificate row (number, issuedAt, validUntil)
 * plus the CalibrationJob's device/customer identity — nothing here is
 * allocated or decided at render time. Fields the domain does not support are
 * not invented; optional ones are simply omitted when absent.
 */
export interface GeneratedCertificatePdfInput {
  number: string;
  issuedAt: Date;
  validUntil: Date | null;
  companyName: string;
  customerName: string;
  device: {
    name: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    code: string;
  };
  /** Public verification URL the QR code encodes (opaque token only). */
  verificationUrl: string;
}

/** Long-form date in the business timezone, e.g. "1 Oktober 2026". */
export function formatCertificateDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Filename for the stored generated PDF: the number with `/` made path-safe. */
export function generatedCertificateFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
}

export interface RenderCertificatePdfOptions {
  /** PDF stream compression (default true). Tests turn it off to read the page content. */
  compress?: boolean;
}

export async function renderGeneratedCertificatePdf(
  input: GeneratedCertificatePdfInput,
  options: RenderCertificatePdfOptions = {},
): Promise<Buffer> {
  // The QR is a locator: only the verification URL is encoded — never the
  // certificate data, the PDF, or any customer/device identifier.
  const qrPng = await QRCode.toBuffer(input.verificationUrl, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, compress: options.compress ?? true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const left = 50;
    const width = doc.page.width - 100;
    let y = 60;

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text(input.companyName, left, y);
    y += 40;

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#0f172a")
      .text("SERTIFIKAT KALIBRASI", left, y, { width, align: "center" });
    y += 32;
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#334155")
      .text("Calibration Certificate", left, y, { width, align: "center" });
    y += 36;

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#0f172a")
      .text(`Nomor: ${input.number}`, left, y, { width, align: "center" });
    y += 40;

    const rows: Array<[string, string]> = [
      ["Pelanggan", input.customerName],
      ["Nama alat", input.device.name],
    ];
    if (input.device.brand) rows.push(["Merek", input.device.brand]);
    if (input.device.model) rows.push(["Model / tipe", input.device.model]);
    if (input.device.serialNumber) rows.push(["Nomor seri", input.device.serialNumber]);
    rows.push(["Kode alat", input.device.code]);
    rows.push(["Tanggal terbit", formatCertificateDate(input.issuedAt)]);
    if (input.validUntil) rows.push(["Berlaku sampai", formatCertificateDate(input.validUntil)]);

    for (const [label, value] of rows) {
      doc.font("Helvetica").fontSize(10).fillColor("#64748b").text(label, left, y, { width: 130 });
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0f172a")
        .text(value, left + 140, y, { width: width - 140 });
      y = Math.max(y + 18, doc.y + 4);
    }

    const qrSize = 110;
    const qrY = doc.page.height - 50 - qrSize - 40;
    doc.image(qrPng, left, qrY, { width: qrSize, height: qrSize });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#334155")
      .text("Pindai kode QR untuk memverifikasi keabsahan sertifikat ini.", left + qrSize + 16, qrY + 20, {
        width: width - qrSize - 16,
      });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748b")
      .text(input.verificationUrl, left + qrSize + 16, qrY + 60, {
        width: width - qrSize - 16,
      });

    doc.end();
  });
}
