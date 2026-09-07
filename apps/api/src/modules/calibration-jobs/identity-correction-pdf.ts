import PDFDocument from "pdfkit";
import type { Company } from "@medcal/db";
import { quotationPdfFilename } from "../quotations/quotation-pdf";
import {
  KAN_ACCREDITATION_CODE,
  PKM_LETTERHEAD_ADDRESS_LINES,
  formatDate,
  formatDateTime,
  resolveKanLogoPath,
  resolvePkmLogoPath,
  text,
} from "../work-orders/work-order-pdf-shared";
import type { IdentityCorrectionDetail } from "./calibration-jobs.service";

const MARGIN = 50;
const INK = "#0f172a";
const MUTED = "#475569";

/**
 * "BERITA ACARA KOREKSI IDENTITAS" — printable version of the Identity
 * Correction BA already shown inline on the Calibration Job detail page.
 * Reuses the same PKM/KAN letterhead + footer as the SPK / Surat Jalan Alat
 * (apps/api/src/modules/work-orders/work-order-pdf-spk.ts and
 * equipment-delivery-note-pdf.ts) — same engine (pdfkit), page size, fonts,
 * and layout idioms (labelRow, table, page-break-before-signature-block).
 *
 * Every value comes from the IdentityCorrection record and its parent
 * CalibrationJob — nothing is invented (no wet-signature block, since this
 * document's "signature" is the recorded status + name, not an authority
 * sign-off).
 */

export interface IdentityCorrectionPdfJobContext {
  workOrder: { number: string };
  customerDeclaredDeviceName: string | null;
  customerDeclaredAkdAkl: string | null;
}

export interface IdentityCorrectionPdfPhoto {
  buffer: Buffer;
  mimeType: string | null;
  originalName: string | null;
}

export interface IdentityCorrectionPdfResult {
  buffer: Buffer;
  filename: string;
}

const STATUS_LABELS: Record<IdentityCorrectionDetail["status"], string> = {
  PENDING_REVIEW: "Menunggu Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

const SIGNER_LABELS: Record<"TECHNICIAN" | "CUSTOMER", string> = {
  TECHNICIAN: "Teknisi",
  CUSTOMER: "Pelanggan",
};

const SIGNATURE_STATUS_LABELS: Record<"SIGNED" | "UNAVAILABLE" | "REFUSED", string> = {
  SIGNED: "Ditandatangani",
  UNAVAILABLE: "Tidak tersedia",
  REFUSED: "Menolak menandatangani",
};

export function renderIdentityCorrectionPdf(input: {
  correction: IdentityCorrectionDetail;
  job: IdentityCorrectionPdfJobContext;
  company: Company;
  photo?: IdentityCorrectionPdfPhoto | null;
}): Promise<IdentityCorrectionPdfResult> {
  const { correction, job, company, photo } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: quotationPdfFilename({
          number: correction.number,
          companyId: company.id,
          issuedAt: correction.createdAt,
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
      .text("BERITA ACARA KOREKSI IDENTITAS", left, y, { width: contentWidth, align: "center" });
    y = doc.y + 10;

    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(`Tanggal: ${formatDate(correction.createdAt)}`, left, y, {
      width: contentWidth,
      align: "right",
    });
    y = doc.y + 12;

    doc.text(`Nomor: ${correction.number}`, left, y);
    y = doc.y;
    doc.fontSize(8).fillColor(MUTED).text(`Ref. SPK ${job.workOrder.number}`, left, y);
    y = doc.y;
    doc.fontSize(10).fillColor(INK);
    y += 16;

    y = labelRow(
      doc,
      left,
      y,
      "Alat (Deklarasi Pelanggan)",
      text(job.customerDeclaredDeviceName) ?? "—",
      contentWidth,
    );
    y = labelRow(
      doc,
      left,
      y,
      "AKD/AKL Deklarasi",
      text(job.customerDeclaredAkdAkl) ?? "—",
      contentWidth,
    );
    y = labelRow(doc, left, y, "Status BA", STATUS_LABELS[correction.status], contentWidth);
    y += 10;

    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("ALASAN", left, y);
    y = doc.y + 4;
    doc.font("Helvetica").fontSize(10).text(correction.reason, left, y, { width: contentWidth });
    y = doc.y + 14;

    const changes = summarizeChanges(correction);
    if (changes.length > 0) {
      doc.font("Helvetica-Bold").fontSize(11).text("PERUBAHAN", left, y);
      y = doc.y + 6;
      y = drawChangesTable(doc, changes, left, contentWidth, y);
      y += 14;
    }

    doc.font("Helvetica-Bold").fontSize(11).text("TANDA TANGAN", left, y);
    y = doc.y + 6;
    y = drawSignatures(doc, correction, left, contentWidth, y);
    y += 14;

    if (y + 60 > bottomLimit) {
      doc.addPage();
      y = MARGIN;
    }
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("FOTO BA", left, y);
    y = doc.y + 6;
    y = drawPhotoSection(doc, correction, photo, left, right, contentWidth, y, bottomLimit);
    y += 14;

    if (y + 60 > bottomLimit) {
      doc.addPage();
      y = MARGIN;
    }
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("KEPUTUSAN", left, y);
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(10);
    if (correction.status === "PENDING_REVIEW") {
      doc
        .fillColor(MUTED)
        .font("Helvetica-Oblique")
        .text("Menunggu keputusan TECHNICIAN_MANAGER.", left, y, { width: contentWidth });
      doc.font("Helvetica").fillColor(INK);
      y = doc.y;
    } else {
      y = labelRow(doc, left, y, "Diputuskan oleh", correction.decidedBy?.name ?? "—", contentWidth);
      y = labelRow(
        doc,
        left,
        y,
        "Diputuskan pada",
        formatDateTime(correction.decidedAt),
        contentWidth,
      );
      y = labelRow(
        doc,
        left,
        y,
        "Catatan keputusan",
        text(correction.decisionNote) ?? "—",
        contentWidth,
      );
    }

    drawFooterAllPages(doc, company);
    doc.end();
  });
}

interface ChangeRow {
  attr: string;
  prev: string;
  next: string;
}

function summarizeChanges(correction: IdentityCorrectionDetail): ChangeRow[] {
  const dash = (v: string | null | undefined) => text(v ?? null) ?? "—";
  const rows: ChangeRow[] = [];
  if (correction.newDeviceId !== null) {
    rows.push({
      attr: "Device",
      prev: dash(correction.prevDevice?.code),
      next: dash(correction.newDevice?.code),
    });
  }
  if (correction.newSerial !== null) {
    rows.push({ attr: "Serial", prev: dash(correction.prevSerial), next: dash(correction.newSerial) });
  }
  if (correction.newAkdAkl !== null) {
    rows.push({
      attr: "AKD/AKL/NIE",
      prev: dash(correction.prevAkdAkl),
      next: dash(correction.newAkdAkl),
    });
  }
  return rows;
}

function drawChangesTable(
  doc: PDFKit.PDFDocument,
  rows: ChangeRow[],
  left: number,
  contentWidth: number,
  startY: number,
): number {
  const cols = [
    { label: "Atribut", width: contentWidth * 0.28 },
    { label: "Sebelum", width: contentWidth * 0.36 },
    { label: "Sesudah", width: 0 },
  ];
  cols[2].width = contentWidth - cols[0].width - cols[1].width;

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
  for (const row of rows) {
    const rowY = y;
    const values = [row.attr, row.prev, row.next];
    let maxBottom = rowY;
    values.forEach((value, i) => {
      doc.text(value, x[i] + 2, rowY, { width: cols[i].width - 4 });
      maxBottom = Math.max(maxBottom, doc.y);
    });
    y = maxBottom + 4;
    doc
      .moveTo(left, y - 2)
      .lineTo(left + contentWidth, y - 2)
      .lineWidth(0.3)
      .strokeColor("#cbd5e1")
      .stroke();
  }

  return y;
}

function drawSignatures(
  doc: PDFKit.PDFDocument,
  correction: IdentityCorrectionDetail,
  left: number,
  contentWidth: number,
  startY: number,
): number {
  const colWidth = (contentWidth - 16) / 2;
  const roles: Array<"TECHNICIAN" | "CUSTOMER"> = ["TECHNICIAN", "CUSTOMER"];
  let maxBottom = startY;

  roles.forEach((role, i) => {
    const sig = correction.signatures.find((s) => s.signerRole === role);
    const x = left + i * (colWidth + 16);
    let y = startY;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(SIGNER_LABELS[role], x, y, {
      width: colWidth,
    });
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(10);
    if (!sig) {
      doc.fillColor(MUTED).text("—", x, y, { width: colWidth });
    } else {
      const line =
        sig.status === "SIGNED"
          ? `${SIGNATURE_STATUS_LABELS[sig.status]} · ${text(sig.signerName) ?? "—"}`
          : SIGNATURE_STATUS_LABELS[sig.status];
      doc.fillColor(INK).text(line, x, y, { width: colWidth });
      y = doc.y;
      if (sig.status !== "SIGNED" && text(sig.unavailableReason)) {
        doc.fontSize(9).fillColor(MUTED).text(sig.unavailableReason!.trim(), x, y, { width: colWidth });
        doc.fontSize(10).fillColor(INK);
      }
    }
    maxBottom = Math.max(maxBottom, doc.y);
  });

  return maxBottom;
}

const MAX_PHOTO_HEIGHT = 220;

function drawPhotoSection(
  doc: PDFKit.PDFDocument,
  correction: IdentityCorrectionDetail,
  photo: IdentityCorrectionPdfPhoto | null | undefined,
  left: number,
  right: number,
  contentWidth: number,
  startY: number,
  bottomLimit: number,
): number {
  let y = startY;
  doc.font("Helvetica").fontSize(10).fillColor(INK);

  if (photo && (photo.mimeType ?? "").startsWith("image/")) {
    if (y + MAX_PHOTO_HEIGHT > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    try {
      const maxWidth = Math.min(contentWidth, 320);
      doc.image(photo.buffer, left, y, { fit: [maxWidth, MAX_PHOTO_HEIGHT] });
      y += MAX_PHOTO_HEIGHT + 4;
    } catch {
      doc
        .fillColor(MUTED)
        .font("Helvetica-Oblique")
        .text("Gagal memuat foto BA.", left, y, { width: contentWidth });
      doc.font("Helvetica").fillColor(INK);
      y = doc.y;
    }
    return y;
  }

  if (photo && photo.mimeType === "application/pdf") {
    doc
      .fillColor(MUTED)
      .text(`Lampiran diunggah sebagai file PDF terpisah: ${photo.originalName ?? "lampiran.pdf"}`, left, y, {
        width: contentWidth,
      });
    doc.fillColor(INK);
    return doc.y;
  }

  const anySigned = correction.signatures.some((s) => s.status === "SIGNED");
  doc
    .font("Helvetica-Oblique")
    .fillColor(MUTED)
    .text(
      anySigned ? "Foto BA belum diunggah." : "Tidak ada tanda tangan — foto tidak diperlukan.",
      left,
      y,
      { width: contentWidth },
    );
  doc.font("Helvetica").fillColor(INK);
  return doc.y;
}

/** "Label      : value" row with a hanging indent so wrapped lines align. */
function labelRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  label: string,
  value: string,
  contentWidth: number,
): number {
  const labelWidth = 150;
  const valueX = x + labelWidth + 12;
  const valueWidth = contentWidth - labelWidth - 12;
  const startY = y;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  doc.text(label, x, startY, { width: labelWidth });
  doc.text(":", x + labelWidth, startY, { width: 8 });
  doc.text(value, valueX, startY, { width: valueWidth });
  return Math.max(doc.y, startY + 14);
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
