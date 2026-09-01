import PDFDocument from "pdfkit";
import type { Company } from "@medcal/db";
import {
  KAN_ACCREDITATION_CODE,
  PKM_LETTERHEAD_ADDRESS_LINES,
  formatDate,
  resolveKanLogoPath,
  resolvePkmLogoPath,
  text,
  workOrderPdfFilename,
} from "./work-order-pdf-shared";

const MARGIN = 50;
const INK = "#0f172a";
const MUTED = "#475569";

/**
 * "SURAT JALAN ALAT" — the delivery note that accompanies PKM reference
 * equipment carried to a customer site for an ON_SITE calibration.
 *
 * Layout authority: the hard-copy Surat Jalan Alat supplied by the business
 * (same PKM/KAN letterhead + footer as the SPK — apps/portal/public/SPK.jpeg).
 * Reuses the shared letterhead constants, logo resolvers, date and text helpers
 * from work-order-pdf-shared.ts; the pdfkit engine, page size, fonts and
 * signature convention (title only, wet signature) match the SPK renderer.
 *
 * Every value comes from the EquipmentDeliveryNote header + item snapshots —
 * nothing is read from live WorkOrderEquipment / Equipment master, so an issued
 * document never changes. No text is invented beyond the fixed statement drawn
 * from the hard-copy document.
 */

export interface DeliveryNotePdfItem {
  equipmentName: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  sortOrder: number;
}

export interface DeliveryNotePdfSource {
  number: string;
  issuedAt: Date;
  workOrderNumber: string;
  customerName: string;
  customerAddress: string | null;
  locationText: string | null;
  items: DeliveryNotePdfItem[];
}

export interface DeliveryNotePdfResult {
  buffer: Buffer;
  filename: string;
}

export function renderEquipmentDeliveryNotePdf(input: {
  deliveryNote: DeliveryNotePdfSource;
  company: Company;
}): Promise<DeliveryNotePdfResult> {
  const { deliveryNote, company } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: workOrderPdfFilename({
          number: deliveryNote.number,
          companyId: company.id,
          issuedAt: deliveryNote.issuedAt,
        }),
      });
    });

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 90;

    let y = drawLetterhead(doc, company, left, right);

    y += 18;
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(INK)
      .text("SURAT JALAN ALAT", left, y, { width: contentWidth, align: "center" });
    y = doc.y + 10;

    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(`Tanggal: ${formatDate(deliveryNote.issuedAt)}`, left, y, {
      width: contentWidth,
      align: "right",
    });
    y = doc.y + 12;

    doc.text(`Nomor: ${deliveryNote.number}`, left, y);
    y = doc.y;
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Ref. SPK ${deliveryNote.workOrderNumber}`, left, y);
    y = doc.y;
    doc.fontSize(10).fillColor(INK);
    y += 16;

    doc.font("Helvetica").fontSize(10).text("Kepada Yth.", left, y);
    y = doc.y + 2;
    doc.font("Helvetica-Bold").text(deliveryNote.customerName, left, y, { width: contentWidth });
    y = doc.y;
    doc.font("Helvetica");
    const address = text(deliveryNote.customerAddress);
    if (address) {
      doc.text(address, left, y, { width: contentWidth });
      y = doc.y;
    }
    y += 12;

    const lokasi = text(deliveryNote.locationText);
    if (lokasi) {
      y = labelRow(doc, left, y, "Lokasi", lokasi, contentWidth);
    }
    y += 6;

    doc.text(
      "Bersama surat ini kami kirimkan alat standar berikut untuk digunakan pada kegiatan " +
        "kalibrasi di lokasi pelanggan :",
      left,
      y,
      { width: contentWidth },
    );
    y = doc.y + 12;

    y = drawItemsTable(doc, deliveryNote.items, left, contentWidth, y);
    y += 16;

    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(
      "Alat standar di atas dibawa oleh teknisi untuk pelaksanaan kalibrasi dan akan " +
        "dikembalikan ke laboratorium setelah kegiatan selesai.",
      left,
      y,
      { width: contentWidth },
    );
    y = doc.y + 24;

    const signatureHeight = 96;
    if (y + signatureHeight > bottomLimit) {
      doc.addPage();
      y = MARGIN;
    }
    const sigX = right - 220;
    doc.text("Laboratorium Kalibrasi", sigX, y, { width: 220 });
    y = doc.y;
    doc.text(company.name, sigX, y, { width: 220 });
    y = doc.y + 58;
    doc.moveTo(sigX, y).lineTo(sigX + 180, y).strokeColor("#94a3b8").stroke();
    y += 4;
    doc.font("Helvetica-Bold").text("Manager Teknis", sigX, y, { width: 220 });
    doc.font("Helvetica");

    drawFooterAllPages(doc, company);
    doc.end();
  });
}

function drawItemsTable(
  doc: PDFKit.PDFDocument,
  items: DeliveryNotePdfItem[],
  left: number,
  contentWidth: number,
  startY: number,
): number {
  const cols = [
    { label: "No", width: 28 },
    { label: "Nama Alat", width: contentWidth * 0.34 },
    { label: "Merk", width: contentWidth * 0.24 },
    { label: "Type / Model", width: contentWidth * 0.19 },
    { label: "Serial Number", width: 0 },
  ];
  cols[4].width = contentWidth - cols[0].width - cols[1].width - cols[2].width - cols[3].width;

  const x: number[] = [];
  let acc = left;
  for (const col of cols) {
    x.push(acc);
    acc += col.width;
  }

  let y = startY;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  cols.forEach((col, i) => doc.text(col.label, x[i] + 2, y, { width: col.width - 4 }));
  y = doc.y + 3;
  doc.moveTo(left, y).lineTo(left + contentWidth, y).lineWidth(0.8).strokeColor(INK).stroke();
  y += 4;

  doc.font("Helvetica").fontSize(9).fillColor(INK);
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  ordered.forEach((item, index) => {
    const rowY = y;
    const values = [
      String(index + 1),
      item.equipmentName,
      text(item.brand) ?? "-",
      text(item.model) ?? "-",
      text(item.serialNumber) ?? "-",
    ];
    let maxBottom = rowY;
    values.forEach((value, i) => {
      doc.text(value, x[i] + 2, rowY, { width: cols[i].width - 4 });
      maxBottom = Math.max(maxBottom, doc.y);
    });
    y = maxBottom + 4;
    doc.moveTo(left, y - 2).lineTo(left + contentWidth, y - 2).lineWidth(0.3).strokeColor("#cbd5e1").stroke();
  });

  return y;
}

function labelRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  label: string,
  value: string,
  contentWidth: number,
): number {
  const labelWidth = 90;
  const valueX = x + labelWidth + 12;
  const valueWidth = contentWidth - labelWidth - 12;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  doc.text(label, x, y, { width: labelWidth });
  doc.text(":", x + labelWidth, y, { width: 8 });
  doc.text(value, valueX, y, { width: valueWidth });
  return Math.max(doc.y, y + 14);
}

function drawLetterhead(
  doc: PDFKit.PDFDocument,
  company: { name: string; legalName: string | null },
  left: number,
  right: number,
): number {
  const top = doc.y;
  const contentWidth = right - left;

  const pkmLogo = resolvePkmLogoPath();
  if (pkmLogo) {
    try {
      doc.image(pkmLogo, left, top, { fit: [118, 50] });
    } catch {
      /* continue without logo */
    }
  }

  const kanLogo = resolveKanLogoPath();
  if (kanLogo) {
    try {
      const w = 92;
      doc.image(kanLogo, right - w, top, { fit: [w, 34] });
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(INK)
        .text(KAN_ACCREDITATION_CODE, right - w, top + 38, { width: w, align: "center" });
    } catch {
      /* continue without logo */
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK)
    .text("LABORATORIUM KALIBRASI", left, top + 6, { width: contentWidth, align: "center" });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(company.legalName?.toUpperCase() ?? company.name.toUpperCase(), left, doc.y + 1, {
      width: contentWidth,
      align: "center",
    });

  const ruleY = Math.max(doc.y, top + 52) + 8;
  doc.moveTo(left, ruleY).lineTo(right, ruleY).lineWidth(1.4).strokeColor(INK).stroke();
  doc.lineWidth(1);
  return ruleY + 6;
}

function drawFooterAllPages(
  doc: PDFKit.PDFDocument,
  company: { name: string; legalName: string | null },
) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom - 44;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(INK).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(INK)
      .text((company.legalName ?? company.name).toUpperCase(), left, y + 5, {
        width: right - left,
        align: "center",
      });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    for (const l of PKM_LETTERHEAD_ADDRESS_LINES) {
      doc.text(l, left, doc.y, { width: right - left, align: "center" });
    }
  }
}
