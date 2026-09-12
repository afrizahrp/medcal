import PDFDocument from "pdfkit";
import {
  PKM_LETTERHEAD_ADDRESS_LINES,
  formatDate,
  formatDateTime,
  resolvePkmLogoPath,
  text,
} from "../work-orders/work-order-pdf-shared";
import { quotationPdfFilename } from "../quotations/quotation-pdf";

const MARGIN = 45;
const INK = "#0f172a";
const MUTED = "#475569";
const BORDER = "#334155";
const LINE_GAP = 1;

/**
 * Generic LK (Lembar Kerja) result renderer — LK Result PDF Download v1.
 *
 * Deliberately data-driven: every measurement/physical-check/equipment
 * section below is built from whatever CalibrationJob → DeviceType →
 * DeviceCapability → DeviceCalibrationParameter/CalibrationTestPoint →
 * MeasurementResult structure the caller resolved. There is NO
 * `if (deviceType === ...)` / `switch(deviceType)` branch anywhere in this
 * file — see the forensic audit at
 * docs/claude/plans/Calibration-management/measurement-results/UI-implementation/forensic-verification/
 * for why this shape was chosen and what is deliberately NOT rendered yet
 * (unresolved business rules — Technical Review scoring, electrical
 * protection-class metadata, insulation "OR" semantics, etc. — see that
 * report's gap classification; this renderer only shows raw existing data
 * for those, never an invented interpretation).
 */

export interface LkResultPdfRow {
  /** e.g. parameter name, or "<parameter name> — <test point setting label>". */
  label: string;
  /** Pre-formatted measured value(s), one per replicate, already joined. */
  value: string;
  /** Pre-formatted tolerance text (from toleranceNote or min/max), or null. */
  toleranceText: string | null;
}

export interface LkResultPdfSection {
  /** DeviceCapability.name — e.g. "Kondisi Lingkungan", "Keselamatan Listrik". */
  capabilityName: string;
  rows: LkResultPdfRow[];
}

export interface LkResultPdfPhysicalCheckRow {
  name: string;
  inspectionLimitSnapshot: string;
  verdict: "BAIK" | "TIDAK_BAIK";
  note: string | null;
}

export interface LkResultPdfEquipmentRow {
  equipmentTypeName: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
}

export interface LkResultPdfInput {
  company: {
    id: string;
    name: string;
    legalName: string | null;
  };
  job: {
    id: string;
    unitOrdinal: number;
    unitTotal: number;
    currentAttempt: number;
    startedAt: Date | null;
    submittedAt: Date | null;
    workOrderNumber: string;
    customerName: string;
    deviceTypeName: string | null;
    deviceBrand: string | null;
    deviceModel: string | null;
    deviceSerial: string | null;
  };
  qualityReview: {
    decision: string | null;
    status: string;
    reviewerName: string | null;
    reviewedAt: Date | null;
    notes: string | null;
  } | null;
  equipmentUsed: LkResultPdfEquipmentRow[];
  physicalChecks: LkResultPdfPhysicalCheckRow[];
  capabilitySections: LkResultPdfSection[];
  /** Wall-clock time the PDF was generated — shown in the footer, not stored. */
  generatedAt: Date;
}

export interface LkResultPdfResult {
  buffer: Buffer;
  filename: string;
}

const QUALITY_REVIEW_DECISION_LABELS: Record<string, string> = {
  APPROVE: "Disetujui (APPROVE)",
  REJECT: "Ditolak (REJECT)",
};

/** Render the generic LK (Lembar Kerja) result PDF for one CalibrationJob. */
export function renderLkResultPdf(input: LkResultPdfInput): Promise<LkResultPdfResult> {
  const { company, job, qualityReview, equipmentUsed, physicalChecks, capabilitySections } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: quotationPdfFilename({
          number: `LK-${job.id}`,
          companyId: company.id,
          issuedAt: job.submittedAt ?? input.generatedAt,
        }),
      });
    });

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 40;

    const headerTop = doc.y;
    const pkmLogo = resolvePkmLogoPath();
    if (pkmLogo) {
      try {
        doc.image(pkmLogo, left, headerTop, { fit: [100, 36] });
      } catch {
        /* continue without logo */
      }
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(INK)
      .text("LEMBAR KERJA KALIBRASI (HASIL)", left, headerTop + 4, { width, align: "center" });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `${text(job.deviceTypeName) ?? "Alat"} — Unit ${job.unitOrdinal} dari ${job.unitTotal}`,
        left,
        doc.y + 2,
        { width, align: "center" },
      );
    let y = Math.max(doc.y, headerTop + 40) + 12;

    // ── A. Administrative + B. Customer/Device ─────────────────────────────
    y = sectionTitle(doc, left, y, "A. Data Administratif & Identitas Alat");
    y = kvTable(doc, left, y, width, [
      ["No. Work Order", job.workOrderNumber],
      ["Pelanggan", job.customerName],
      ["Jenis Alat", text(job.deviceTypeName) ?? "—"],
      ["Merk", text(job.deviceBrand) ?? "—"],
      ["Model / Tipe", text(job.deviceModel) ?? "—"],
      ["No. Seri", text(job.deviceSerial) ?? "—"],
      ["Tgl. Mulai", formatDate(job.startedAt)],
      ["Tgl. Selesai (Submit)", formatDate(job.submittedAt)],
      ["Attempt / Revisi ke", String(job.currentAttempt)],
    ]);
    y += 12;

    // ── C. Equipment Reference ──────────────────────────────────────────────
    y = ensureSpace(doc, y, 60, bottomLimit);
    y = sectionTitle(doc, left, y, "B. Daftar Alat Acuan yang Digunakan");
    if (equipmentUsed.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text("—", left, y);
      y = doc.y + 8;
    } else {
      y = kvTable(
        doc,
        left,
        y,
        width,
        equipmentUsed.map((eq) => [
          eq.equipmentTypeName,
          [text(eq.brand), text(eq.model), eq.serialNumber ? `SN ${eq.serialNumber}` : null]
            .filter(Boolean)
            .join(" · ") || "—",
        ]),
      );
      y += 12;
    }

    // ── D. Physical Inspection ───────────────────────────────────────────────
    y = ensureSpace(doc, y, 60, bottomLimit);
    y = sectionTitle(doc, left, y, "C. Pemeriksaan Fisik dan Fungsi Alat");
    if (physicalChecks.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text("—", left, y);
      y = doc.y + 8;
    } else {
      y = kvTable(
        doc,
        left,
        y,
        width,
        physicalChecks.map((p) => [
          p.name,
          `${p.verdict === "BAIK" ? "Baik" : "Tidak Baik"}${p.note ? ` — ${p.note}` : ""}`,
        ]),
      );
      y += 12;
    }

    // ── E/F/G. Generic capability sections (environmental, electrical
    // safety, performance/kinerja) — one section per DeviceCapability, driven
    // entirely by data resolved by the caller. ─────────────────────────────
    let sectionLetter = "D";
    for (const section of capabilitySections) {
      if (section.rows.length === 0) continue;
      y = ensureSpace(doc, y, 60, bottomLimit);
      y = sectionTitle(doc, left, y, `${sectionLetter}. ${section.capabilityName}`);
      y = kvTable(
        doc,
        left,
        y,
        width,
        section.rows.map((row) => [
          row.label,
          `${row.value}${row.toleranceText ? ` (Toleransi: ${row.toleranceText})` : ""}`,
        ]),
      );
      y += 12;
      sectionLetter = nextLetter(sectionLetter);
    }

    // ── Quality Review / approval ────────────────────────────────────────────
    y = ensureSpace(doc, y, 60, bottomLimit);
    y = sectionTitle(doc, left, y, `${sectionLetter}. Telaah / Persetujuan Mutu (Quality Review)`);
    if (!qualityReview) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text("Belum ada review.", left, y);
      y = doc.y + 8;
    } else {
      y = kvTable(doc, left, y, width, [
        [
          "Keputusan",
          qualityReview.decision
            ? QUALITY_REVIEW_DECISION_LABELS[qualityReview.decision] ?? qualityReview.decision
            : "—",
        ],
        ["Direview oleh", text(qualityReview.reviewerName) ?? "—"],
        ["Tanggal Review", formatDateTime(qualityReview.reviewedAt)],
        ["Catatan", text(qualityReview.notes) ?? "—"],
      ]);
      y += 12;
    }

    drawFooterAllPages(doc, company, input.generatedAt);
    doc.end();
  });
}

function nextLetter(letter: string): string {
  return String.fromCharCode(letter.charCodeAt(0) + 1);
}

function sectionTitle(doc: PDFKit.PDFDocument, x: number, y: number, title: string): number {
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(title, x, y);
  return doc.y + 3;
}

function kvTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: Array<[string, string]>,
): number {
  const labelWidth = 190;
  const valueWidth = width - labelWidth;
  const padX = 5;
  const padY = 3;
  let top = y;

  doc.font("Helvetica").fontSize(9);
  for (const [label, value] of rows) {
    const labelH = doc.heightOfString(label, { width: labelWidth - padX * 2, lineGap: LINE_GAP });
    const valueH = doc.heightOfString(value, { width: valueWidth - padX * 2, lineGap: LINE_GAP });
    const rowH = Math.max(labelH, valueH) + padY * 2;

    doc.rect(x, top, labelWidth, rowH).strokeColor(BORDER).lineWidth(0.7).stroke();
    doc.rect(x + labelWidth, top, valueWidth, rowH).strokeColor(BORDER).lineWidth(0.7).stroke();

    doc
      .fillColor(MUTED)
      .text(label, x + padX, top + padY, { width: labelWidth - padX * 2, lineGap: LINE_GAP });
    doc.fillColor(INK).text(value, x + labelWidth + padX, top + padY, {
      width: valueWidth - padX * 2,
      lineGap: LINE_GAP,
    });
    top += rowH;
  }
  doc.lineWidth(1);
  return top;
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  needed: number,
  bottomLimit: () => number,
): number {
  if (y + needed > bottomLimit()) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

function drawFooterAllPages(
  doc: PDFKit.PDFDocument,
  company: { name: string; legalName: string | null },
  generatedAt: Date,
): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom - 30;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(INK).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(
      `Halaman ${i - range.start + 1} dari ${range.count} · Dokumen dibuat ${formatDateTime(generatedAt)}`,
      left,
      y + 4,
      { width: right - left, align: "right" },
    );
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(INK)
      .text((company.legalName ?? company.name).toUpperCase(), left, y + 4, {
        width: right - left,
        align: "center",
      });
    doc.font("Helvetica").fontSize(7).fillColor(MUTED);
    for (const l of PKM_LETTERHEAD_ADDRESS_LINES) {
      doc.text(l, left, doc.y, { width: right - left, align: "center" });
    }
  }
}
