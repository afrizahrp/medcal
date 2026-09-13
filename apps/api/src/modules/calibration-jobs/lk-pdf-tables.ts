import {
  BORDER,
  INK,
  LINE_GAP,
  MIN_ROW_H,
  addContentPage,
  contentBottom,
  fontBold,
  fontRegular,
  type LkPdfLayout,
} from "./lk-pdf-layout";

export type LkCheckMark = { label: string; checked: boolean };

export type LkTableCell = {
  text?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  fontSize?: number;
  /** Word w:gridSpan. */
  colSpan?: number;
  /** Word w:vMerge. First cell only; later rows omit the column. */
  rowSpan?: number;
  /** Word form checkbox (circle + label), stacked vertically. */
  marks?: LkCheckMark[];
  markLayout?: "stack" | "inline";
  minHeight?: number;
};

const TWIP_PT = 20;

/** Use Word twip widths in pt when they fit; scale only if they would overflow. */
export function widthsFromTwips(layout: LkPdfLayout, twips: number[]): number[] {
  const pts = twips.map((t) => t / TWIP_PT);
  const sum = pts.reduce((a, b) => a + b, 0);
  if (sum <= layout.width + 0.6) return pts;
  return twips.map((t) => (t / twips.reduce((a, b) => a + b, 0)) * layout.width);
}

function spanWidths(grid: number[], start: number, span: number): number {
  return grid.slice(start, start + span).reduce((a, b) => a + b, 0);
}

function expandRow(
  cells: LkTableCell[],
  colCount: number,
  occupancy: number[],
): Array<{ cell: LkTableCell; start: number; span: number; rowSpan: number }> {
  const out: Array<{ cell: LkTableCell; start: number; span: number; rowSpan: number }> = [];
  let i = 0;
  let ci = 0;
  while (i < colCount) {
    if ((occupancy[i] ?? 0) > 0) {
      occupancy[i] -= 1;
      i += 1;
      continue;
    }
    const cell = cells[ci];
    if (!cell) break;
    ci += 1;
    const span = Math.min(cell.colSpan ?? 1, colCount - i);
    const rowSpan = Math.max(1, cell.rowSpan ?? 1);
    out.push({ cell, start: i, span, rowSpan });
    if (rowSpan > 1) {
      for (let c = i; c < i + span; c++) occupancy[c] = rowSpan - 1;
    }
    i += span;
  }
  return out;
}

function marksHeight(marks: LkCheckMark[] | undefined, layout: "stack" | "inline" | undefined): number {
  if (!marks?.length) return 0;
  if (layout === "inline") return 12;
  return marks.length * 11;
}

export type LkTableDrawOpts = {
  minRowH?: number;
  /** When false, a row that does not fit this page must not create a new page. */
  allowOverflowPage?: boolean;
  /** Default cell size when LkTableCell.fontSize is omitted. */
  fontSize?: number;
  fontRegular?: string;
  fontBold?: string;
};

function rowHeight(
  doc: PDFKit.PDFDocument,
  cells: LkTableCell[],
  grid: number[],
  padY: number,
  occupancy: number[],
  minRowH: number,
  style: { fontSize: number; regular: string; bold: string },
): number {
  const occ = occupancy.slice();
  let h = minRowH;
  for (const { cell, start, span, rowSpan } of expandRow(cells, grid.length, occ)) {
    const w = spanWidths(grid, start, span);
    const size = cell.fontSize ?? style.fontSize;
    doc.font(cell.bold ? style.bold : style.regular).fontSize(size);
    const textH = doc.heightOfString(cell.text || " ", {
      width: Math.max(8, w - 6),
      lineGap: LINE_GAP,
    });
    const markH = marksHeight(cell.marks, cell.markLayout);
    const content = Math.max(textH, markH) + padY * 2;
    const share = rowSpan > 1 ? content / rowSpan : content;
    h = Math.max(h, share, cell.minHeight ?? 0);
  }
  return h;
}

function drawCircleMark(doc: PDFKit.PDFDocument, cx: number, cy: number, checked: boolean): void {
  doc.save();
  doc.circle(cx, cy, 3.2).strokeColor(INK).lineWidth(0.7).stroke();
  if (checked) {
    doc.circle(cx, cy, 1.6).fillColor(INK).fill();
  }
  doc.restore();
}

function drawCells(
  doc: PDFKit.PDFDocument,
  x0: number,
  top: number,
  rowH: number,
  cells: LkTableCell[],
  grid: number[],
  padY: number,
  occupancy: number[],
  upcomingHeights: number[],
  style: { fontSize: number; regular: string; bold: string },
): void {
  const expanded = expandRow(cells, grid.length, occupancy);
  for (const { start, span, rowSpan } of expanded) {
    const x = x0 + grid.slice(0, start).reduce((a, b) => a + b, 0);
    const w = spanWidths(grid, start, span);
    const h = upcomingHeights.slice(0, rowSpan).reduce((a, b) => a + b, 0);
    doc.save();
    doc.rect(x, top, w, h).strokeColor(BORDER).lineWidth(0.6).stroke();
    doc.restore();
  }
  for (const { cell, start, span, rowSpan } of expanded) {
    const x = x0 + grid.slice(0, start).reduce((a, b) => a + b, 0);
    const w = spanWidths(grid, start, span);
    const h = upcomingHeights.slice(0, rowSpan).reduce((a, b) => a + b, 0);
    if (cell.marks?.length) {
      const stacked = cell.markLayout !== "inline";
      let cy = top + padY + 5;
      for (const mark of cell.marks) {
        drawCircleMark(doc, x + 7, cy, mark.checked);
        doc.font(style.regular).fontSize(cell.fontSize ?? style.fontSize).fillColor(INK).text(mark.label, x + 13, cy - 4, {
          width: w - 18,
          lineBreak: false,
        });
        cy += stacked ? 11 : 0;
        if (!stacked) break;
      }
      continue;
    }
    const size = cell.fontSize ?? style.fontSize;
    const textY = rowSpan > 1 ? top + Math.max(padY, (h - 10) / 2) : top + padY;
    doc
      .font(cell.bold ? style.bold : style.regular)
      .fontSize(size)
      .fillColor(INK)
      .text(cell.text ?? "", x + 3, textY, {
        width: w - 6,
        align: cell.align ?? "left",
        lineGap: LINE_GAP,
      });
  }
}

/** Draw a table; on page break repeat `headerRows` then continue. */
export function drawGridTable(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  fractionsOrTwips: number[],
  headerRows: LkTableCell[][],
  bodyRows: LkTableCell[][],
  padY = 3,
  unit: "fraction" | "twip" = "fraction",
  opts: LkTableDrawOpts = {},
): number {
  const minRowH = opts.minRowH ?? MIN_ROW_H;
  const allowOverflowPage = opts.allowOverflowPage !== false;
  const style = {
    fontSize: opts.fontSize ?? 8,
    regular: opts.fontRegular ?? fontRegular(),
    bold: opts.fontBold ?? fontBold(),
  };
  const widths =
    unit === "twip" ? widthsFromTwips(layout, fractionsOrTwips) : colWs(layout, fractionsOrTwips);

  const measure = (rows: LkTableCell[][]): number[] => {
    const occ = Array(widths.length).fill(0);
    return rows.map((row) => rowHeight(doc, row, widths, padY, occ, minRowH, style));
  };

  const paintRows = (
    top: number,
    rows: LkTableCell[][],
    heights: number[],
    reprintHeaderOnOverflow: boolean,
  ): number => {
    const occ = Array(widths.length).fill(0);
    let t = top;
    for (let i = 0; i < rows.length; i++) {
      const rowH = heights[i] ?? minRowH;
      if (t + rowH > contentBottom(doc)) {
        if (!allowOverflowPage) {
          throw new Error(
            `LK table overflow on page ${layout.halamanCells.length}: a template-bound row does not fit the remaining page geometry`,
          );
        }
        t = addContentPage(doc, layout);
        if (reprintHeaderOnOverflow && headerRows.length) {
          t = paintRows(t, headerRows, measure(headerRows), false);
        }
      }
      drawCells(doc, layout.left, t, rowH, rows[i]!, widths, padY, occ, heights.slice(i), style);
      t += rowH;
    }
    return t;
  };

  let top = y;
  const headerHeights = measure(headerRows);
  const headerBlockH = headerHeights.reduce((a, b) => a + b, 0);
  if (top + headerBlockH + minRowH > contentBottom(doc)) {
    if (!allowOverflowPage) {
      throw new Error(
        `LK table overflow on page ${layout.halamanCells.length}: header does not fit the remaining page geometry`,
      );
    }
    top = addContentPage(doc, layout);
  }
  top = paintRows(top, headerRows, headerHeights, false);
  const bodyHeights = measure(bodyRows);
  top = paintRows(top, bodyRows, bodyHeights, true);
  doc.lineWidth(1);
  return top;
}

function colWs(layout: LkPdfLayout, fractions: number[]): number[] {
  const total = fractions.reduce((a, b) => a + b, 0);
  return fractions.map((f) => (f / total) * layout.width);
}

export function checkboxPair(baik: boolean | null, tidakBaik: boolean | null): LkTableCell {
  return {
    marks: [
      { label: "Baik", checked: baik === true },
      { label: "Tidak Baik", checked: tidakBaik === true },
    ],
    markLayout: "stack",
  };
}

export function markOption(selected: boolean | null, label: string): LkTableCell {
  return {
    marks: [{ label, checked: selected === true }],
    markLayout: "inline",
  };
}
