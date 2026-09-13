import PDFDocument from "pdfkit";
import { formatDate, formatDateTime, text } from "../work-orders/work-order-pdf-shared";
import { quotationPdfFilename } from "../quotations/quotation-pdf";
import { resolveLkManualHeader, type LkResolvedFormHeader } from "./lk-manual-header-catalog";
import {
  BORDER,
  FOOTER_BAND,
  INK,
  LINE_GAP,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  MIN_ROW_H,
  MUTED,
  addContentPage,
  beginPage,
  contentBottom,
  drawFooterAllPages,
  fillHalamanAllPages,
  fontRegular,
  registerLkFonts,
  sectionTitle,
  type LkPdfLayout,
} from "./lk-pdf-layout";
import type { LkTemplateData } from "./lk-template-data";
import { isBedSideMonitorTemplate, renderBedSideMonitorFromY } from "./lk-templates/bed-side-monitor";

/**
 * LK result PDF — Phase 1 header/pagination + Phase 2 template-aware body
 * when a matched manual template exists (Bed Side Monitor first).
 */

export interface LkResultPdfRow {
  label: string;
  value: string;
  toleranceText: string | null;
}

export interface LkResultPdfSection {
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
  formHeader: LkResolvedFormHeader;
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
  /** Phase 2 — present when a template-aware body should be used. */
  templateData?: LkTemplateData;
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

export function renderLkResultPdf(input: LkResultPdfInput): Promise<LkResultPdfResult> {
  const { company, job, qualityReview, equipmentUsed, physicalChecks, capabilitySections } = input;
  const formHeader = input.formHeader ?? resolveLkManualHeader(job.deviceTypeName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: MARGIN_TOP,
        bottom: MARGIN_BOTTOM + FOOTER_BAND,
        left: MARGIN_LEFT,
        right: MARGIN_RIGHT,
      },
      bufferPages: true,
      autoFirstPage: true,
    });
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

    registerLkFonts(doc);

    const layout: LkPdfLayout = {
      header: formHeader,
      left: doc.page.margins.left,
      right: doc.page.width - doc.page.margins.right,
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      halamanCells: [],
    };

    const y = beginPage(doc, layout);

    if (isBedSideMonitorTemplate(formHeader.sourceFile) && input.templateData) {
      renderBedSideMonitorFromY(doc, layout, y, input.templateData);
    } else {
      renderGenericBody(doc, layout, y, {
        job,
        qualityReview,
        equipmentUsed,
        physicalChecks,
        capabilitySections,
      });
    }

    drawFooterAllPages(doc);
    fillHalamanAllPages(doc, layout);
    doc.end();
  });
}

export { resolveLkManualHeader };

function renderGenericBody(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  startY: number,
  input: {
    job: LkResultPdfInput["job"];
    qualityReview: LkResultPdfInput["qualityReview"];
    equipmentUsed: LkResultPdfEquipmentRow[];
    physicalChecks: LkResultPdfPhysicalCheckRow[];
    capabilitySections: LkResultPdfSection[];
  },
): number {
  const { job, qualityReview, equipmentUsed, physicalChecks, capabilitySections } = input;
  let y = startY;

  y = sectionTitle(doc, layout, y, "A. Data Administratif & Identitas Alat");
  y = kvTable(doc, layout, y, [
    ["No. Work Order", job.workOrderNumber],
    ["Pelanggan", job.customerName],
    ["Jenis Alat", text(job.deviceTypeName) ?? ""],
    ["Merk", text(job.deviceBrand) ?? ""],
    ["Model / Tipe", text(job.deviceModel) ?? ""],
    ["No. Seri", text(job.deviceSerial) ?? ""],
    ["Tgl. Mulai", formatDate(job.startedAt)],
    ["Tgl. Selesai (Submit)", formatDate(job.submittedAt)],
    ["Attempt / Revisi ke", String(job.currentAttempt)],
  ]);
  y += 12;

  y = sectionTitle(doc, layout, y, "B. Daftar Alat Acuan yang Digunakan");
  y = kvTable(
    doc,
    layout,
    y,
    equipmentUsed.length > 0
      ? equipmentUsed.map((eq) => [
          eq.equipmentTypeName,
          [text(eq.brand), text(eq.model), eq.serialNumber ? `SN ${eq.serialNumber}` : null]
            .filter(Boolean)
            .join(" · "),
        ])
      : [["", ""]],
  );
  y += 12;

  y = sectionTitle(doc, layout, y, "C. Pemeriksaan Fisik dan Fungsi Alat");
  y = kvTable(
    doc,
    layout,
    y,
    physicalChecks.length > 0
      ? physicalChecks.map((p) => [
          p.name,
          `${p.verdict === "BAIK" ? "Baik" : "Tidak Baik"}${p.note ? ` — ${p.note}` : ""}`,
        ])
      : [["", ""]],
  );
  y += 12;

  let sectionLetter = "D";
  if (capabilitySections.length === 0) {
    y = sectionTitle(doc, layout, y, `${sectionLetter}. Hasil Pengukuran`);
    y = kvTable(doc, layout, y, [["", ""]]);
    y += 12;
    sectionLetter = String.fromCharCode(sectionLetter.charCodeAt(0) + 1);
  } else {
    for (const section of capabilitySections) {
      y = sectionTitle(doc, layout, y, `${sectionLetter}. ${section.capabilityName}`);
      y = kvTable(
        doc,
        layout,
        y,
        section.rows.length > 0
          ? section.rows.map((row) => [
              row.label,
              `${row.value}${row.toleranceText ? ` (Toleransi: ${row.toleranceText})` : ""}`,
            ])
          : [["", ""]],
      );
      y += 12;
      sectionLetter = String.fromCharCode(sectionLetter.charCodeAt(0) + 1);
    }
  }

  y = sectionTitle(doc, layout, y, `${sectionLetter}. Telaah / Persetujuan Mutu (Quality Review)`);
  y = kvTable(doc, layout, y, [
    [
      "Keputusan",
      qualityReview?.decision
        ? QUALITY_REVIEW_DECISION_LABELS[qualityReview.decision] ?? qualityReview.decision
        : "",
    ],
    ["Direview oleh", text(qualityReview?.reviewerName) ?? ""],
    ["Tanggal Review", qualityReview?.reviewedAt ? formatDateTime(qualityReview.reviewedAt) : ""],
    ["Catatan", text(qualityReview?.notes) ?? ""],
  ]);
  return y;
}

function kvTable(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  rows: Array<[string, string]>,
): number {
  const labelWidth = 190;
  const valueWidth = layout.width - labelWidth;
  const padX = 5;
  const padY = 3;
  let top = y;

  doc.font(fontRegular()).fontSize(9);
  for (const [label, value] of rows) {
    const labelH = doc.heightOfString(label || " ", { width: labelWidth - padX * 2, lineGap: LINE_GAP });
    const valueH = doc.heightOfString(value || " ", { width: valueWidth - padX * 2, lineGap: LINE_GAP });
    const rowH = Math.max(MIN_ROW_H, labelH, valueH) + padY * 2;

    if (top + rowH > contentBottom(doc)) {
      top = addContentPage(doc, layout);
      doc.font(fontRegular()).fontSize(9);
    }

    doc.save();
    doc.rect(layout.left, top, labelWidth, rowH).strokeColor(BORDER).lineWidth(0.7).stroke();
    doc.rect(layout.left + labelWidth, top, valueWidth, rowH).strokeColor(BORDER).lineWidth(0.7).stroke();
    doc.restore();

    doc.font(fontRegular()).fontSize(9).fillColor(MUTED).text(label, layout.left + padX, top + padY, {
      width: labelWidth - padX * 2,
      lineGap: LINE_GAP,
    });
    doc.fillColor(INK).text(value, layout.left + labelWidth + padX, top + padY, {
      width: valueWidth - padX * 2,
      lineGap: LINE_GAP,
    });
    top += rowH;
  }
  doc.lineWidth(1);
  return top;
}
