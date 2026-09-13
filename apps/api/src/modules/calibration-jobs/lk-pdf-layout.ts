import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolvePkmLogoPath } from "../work-orders/work-order-pdf-shared";
import type { LkResolvedFormHeader } from "./lk-manual-header-catalog";

/**
 * Phase 1 page geometry — from LK .docx sectPr (A4, pgMar, header table).
 * Do not change these constants without re-checking the manual templates.
 */
export const TWIP = 20;
const EMU_PER_PT = 12700;
export const MARGIN_LEFT = 652 / TWIP;
export const MARGIN_RIGHT = 567 / TWIP;
export const MARGIN_TOP = 567 / TWIP;
export const MARGIN_BOTTOM = 567 / TWIP;
const HEADER_COL_TWIPS = [2676, 4669, 3282] as const;
const HEADER_META_ROWS = 5;
const HEADER_ROW_H = 16;
export const HEADER_H = HEADER_ROW_H * HEADER_META_ROWS;
export const HEADER_GAP = 10;
export const FOOTER_BAND = 16;
const LOGO_W = 1554480 / EMU_PER_PT;
const LOGO_H = 777240 / EMU_PER_PT;
export const MIN_ROW_H = 16;
export const LINE_GAP = 1;
export const INK = "#000000";
export const MUTED = "#000000";
export const BORDER = "#000000";

const FOOTER_TEXT = "This document is confidential and proprietary of PT. Presisi Kalibrasi Medika";

export type HalamanCell = { x: number; y: number; w: number };

export type LkPdfLayout = {
  header: LkResolvedFormHeader;
  left: number;
  right: number;
  width: number;
  halamanCells: HalamanCell[];
};

const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  meta: "Helvetica",
};

export function registerLkFonts(doc: PDFKit.PDFDocument): void {
  const windir = process.env.WINDIR ?? "C:\\Windows";
  const regular = ["arial.ttf", "Arial.ttf"].map((n) => join(windir, "Fonts", n)).find((p) => existsSync(p));
  const bold = ["arialbd.ttf", "Arialbd.ttf"].map((n) => join(windir, "Fonts", n)).find((p) => existsSync(p));
  const narrow = ["ARIALN.TTF", "arialn.ttf"].map((n) => join(windir, "Fonts", n)).find((p) => existsSync(p));
    FONT.regular = "Helvetica";
    FONT.bold = "Helvetica-Bold";
    FONT.meta = "Helvetica";
    try {
    if (regular) {
      doc.registerFont("LkArial", regular);
      FONT.regular = "LkArial";
      FONT.meta = "LkArial";
    }
    if (bold) {
      doc.registerFont("LkArial-Bold", bold);
      FONT.bold = "LkArial-Bold";
    }
    if (narrow) {
      doc.registerFont("LkArialNarrow", narrow);
      FONT.meta = "LkArialNarrow";
    }
  } catch {
    FONT.regular = "Helvetica";
    FONT.bold = "Helvetica-Bold";
    FONT.meta = "Helvetica";
  }
}

export function fontRegular(): string {
  return FONT.regular;
}

export function fontBold(): string {
  return FONT.bold;
}

export function fontMeta(): string {
  return FONT.meta;
}

export function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

export function beginPage(doc: PDFKit.PDFDocument, layout: LkPdfLayout): number {
  const header = drawLkManualHeader(doc, layout);
  layout.halamanCells.push(header.halaman);
  return header.bottom + HEADER_GAP;
}

export function addContentPage(doc: PDFKit.PDFDocument, layout: LkPdfLayout): number {
  doc.addPage();
  return beginPage(doc, layout);
}

/**
 * Template page boundary (C→D, SPO2→NIBP, …). Always starts a new page with
 * the Phase 1 LK header. Distinct from table overflow: overflow must not
 * create this page, or the next template section is prepended with leftover rows.
 */
export function forceTemplatePage(doc: PDFKit.PDFDocument, layout: LkPdfLayout): number {
  return addContentPage(doc, layout);
}

export function ensureSpace(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number, needed: number): number {
  if (y + needed > contentBottom(doc)) {
    return addContentPage(doc, layout);
  }
  return y;
}

export function sectionTitle(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number, title: string): number {
  const top = ensureSpace(doc, layout, y, 18);
  doc.font(fontBold()).fontSize(9.5).fillColor(INK).text(title, layout.left, top, {
    width: layout.width,
    lineBreak: false,
  });
  return top + 14;
}

export function noteLine(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number, textLine: string): number {
  const h = Math.max(12, doc.font(fontRegular()).fontSize(8).heightOfString(textLine, { width: layout.width }));
  const top = ensureSpace(doc, layout, y, h + 4);
  doc.font(fontRegular()).fontSize(8).fillColor(INK).text(textLine, layout.left, top, { width: layout.width });
  return top + h + 4;
}

export function drawLkManualHeader(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
): { bottom: number; halaman: HalamanCell } {
  const top = MARGIN_TOP;
  const left = layout.left;
  const width = layout.width;
  const col1 = (HEADER_COL_TWIPS[0] / TWIP) * (width / (10627 / TWIP));
  const col3 = (HEADER_COL_TWIPS[2] / TWIP) * (width / (10627 / TWIP));
  const col2 = width - col1 - col3;
  const boxH = HEADER_H;
  const { header } = layout;

  doc.save();
  doc.rect(left, top, width, boxH).strokeColor(BORDER).lineWidth(0.8).stroke();
  doc.moveTo(left + col1, top).lineTo(left + col1, top + boxH).stroke();
  doc.moveTo(left + col1 + col2, top).lineTo(left + col1 + col2, top + boxH).stroke();
  for (let i = 1; i < HEADER_META_ROWS; i++) {
    const ry = top + i * HEADER_ROW_H;
    doc.moveTo(left + col1 + col2, ry).lineTo(left + width, ry).stroke();
  }
  doc.restore();

  const pkmLogo = resolvePkmLogoPath();
  if (pkmLogo) {
    try {
      const fitW = Math.min(LOGO_W, col1 - 10);
      const fitH = Math.min(LOGO_H, boxH - 8);
      doc.image(pkmLogo, left + (col1 - fitW) / 2, top + (boxH - fitH) / 2, { fit: [fitW, fitH] });
    } catch {
      /* continue without logo */
    }
  }

  const titleX = left + col1;
  doc
    .font(fontBold())
    .fontSize(13)
    .fillColor(INK)
    .text("Formulir", titleX, top + 3, { width: col2, align: "center", lineBreak: false });
  doc
    .font(fontBold())
    .fontSize(18)
    .text(header.formTitle, titleX, top + HEADER_ROW_H + 4, {
      width: col2,
      align: "center",
      lineBreak: false,
    });
  if (header.deviceTitle) {
    doc.font(fontBold()).fontSize(18).text(header.deviceTitle, titleX, top + HEADER_ROW_H + 26, {
      width: col2,
      align: "center",
    });
  }

  const metaX = left + col1 + col2;
  const metaLabelW = 78;
  const metaRows: Array<[string, string]> = [
    ["Kode Dokumen", header.documentCode],
    ["Edisi / Revisi", header.editionRevision],
    ["Tanggal Edisi", header.editionDate],
    ["Tanggal Revisi", header.revisionDate],
    ["Halaman", ""],
  ];
  metaRows.forEach(([label, value], i) => {
    const ry = top + i * HEADER_ROW_H + 3.5;
    doc.font(fontMeta()).fontSize(8).fillColor(INK).text(label, metaX + 4, ry, {
      width: metaLabelW,
      lineBreak: false,
    });
    if (value) {
      doc.text(`: ${value}`, metaX + 4 + metaLabelW, ry, {
        width: col3 - metaLabelW - 8,
        lineBreak: false,
      });
    } else if (label !== "Halaman") {
      doc.text(":", metaX + 4 + metaLabelW, ry, { width: 8, lineBreak: false });
    }
  });

  return {
    bottom: top + boxH,
    halaman: {
      x: metaX + 4 + metaLabelW,
      y: top + (HEADER_META_ROWS - 1) * HEADER_ROW_H + 3.5,
      w: col3 - metaLabelW - 8,
    },
  };
}

export function fillHalamanAllPages(doc: PDFKit.PDFDocument, layout: LkPdfLayout): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    const cell = layout.halamanCells[i];
    if (!cell) continue;
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(fontMeta()).fontSize(8).fillColor(INK).text(`: ${i + 1} dari ${total}`, cell.x, cell.y, {
      width: cell.w,
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
  }
}

export function drawFooterAllPages(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.page.height - MARGIN_BOTTOM - 9;
    doc.font(fontRegular()).fontSize(8).fillColor(INK).text(FOOTER_TEXT, left, y, {
      width,
      align: "center",
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
  }
}
