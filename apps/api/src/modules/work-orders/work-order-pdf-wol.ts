import PDFDocument from "pdfkit";
import {
  PKM_LETTERHEAD_ADDRESS_LINES,
  formatDate,
  primaryContact,
  resolvePkmLogoPath,
  text,
  workOrderPdfFilename,
  type WorkOrderPdfInput,
  type WorkOrderPdfResult,
  type WorkOrderPdfSource,
} from "./work-order-pdf-shared";

const MARGIN = 45;
const INK = "#0f172a";
const MUTED = "#475569";
const BORDER = "#334155";
const LINE_GAP = 1;

/** Static form metadata printed in the header box — from the physical form F.MU.07. */
const FORM_META: Array<[string, string]> = [
  ["Kode Dokumen", "F.MU.07"],
  ["Edisi/Revisi", "01/00"],
  ["Tanggal Edisi", "13-01-2025"],
  ["Tanggal Revisi", "-"],
];

/**
 * In Lab Work Order — "Formulir Work Order" (WOL).
 * Layout authority: apps/portal/public/work-order.jpeg (form code F.MU.07).
 *
 * Mapping gaps (no reliable source in the current domain model — the label is
 * printed with "—"; values are NOT invented):
 *   - "Tanggal Terima Alat" (equipment received at lab): no receiving milestone
 *     exists on WorkOrder.
 *   - "Perlengkapan alat" (per-item accessories) and "Kerusakan Alat" (damage):
 *     no field on WorkOrderItem / Device.
 *   - PIC "Jabatan / Bagian" / "No. Hp / Wa" / "No. Telepon": only present when a
 *     CustomerContact carries title / phone.
 *   - Equipment "Merk" / "Tipe" / "No. Seri": from PurchaseOrderItem.device
 *     (brand / model / serialNumber) which is optional; falls back to the
 *     requisition device label, else "—".
 */
export function renderWolPdf(input: WorkOrderPdfInput): Promise<WorkOrderPdfResult> {
  const { workOrder, company } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: workOrderPdfFilename({
          number: workOrder.number,
          companyId: company.id,
          issuedAt: workOrder.createdAt,
        }),
      });
    });

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 40;

    const header = drawHeader(doc, left, right);
    let y = header.bottom + 14;

    const contact = primaryContact(workOrder.customer);

    // I. Identitas Pengirim (PIC)
    y = sectionTitle(doc, left, y, "I. Identitas Pengirim (PIC)");
    y = kvTable(doc, left, y, width, [
      ["Nama", text(contact?.name) ?? "—"],
      ["Jabatan / Bagian", text(contact?.title) ?? "—"],
      ["No. Hp / Wa", text(contact?.phone) ?? text(workOrder.customer.mobile) ?? "—"],
      ["Email", text(contact?.email) ?? text(workOrder.customer.email) ?? "—"],
      ["Instansi", workOrder.customer.name],
      ["Alamat", text(workOrder.customer.address) ?? "—"],
      ["No. Telepon", text(workOrder.customer.phone) ?? "—"],
    ]);
    y += 12;

    // II. Identitas Kepemilikan Alat dan Sertifikat
    y = sectionTitle(doc, left, y, "II. Identitas Kepemilikan Alat dan Sertifikat");
    y = kvTable(doc, left, y, width, [
      ["Nama", text(workOrder.customer.legalName) ?? workOrder.customer.name],
      ["Alamat", text(workOrder.customer.address) ?? "—"],
    ]);
    y += 12;

    // III. Identitas Alat
    y = sectionTitle(doc, left, y, "III. Identitas Alat");
    y = kvTable(doc, left, y, width, [
      ["No. PO", workOrder.purchaseOrder ? text(workOrder.purchaseOrder.customerPoNumber) ?? workOrder.purchaseOrder.number : "—"],
      ["Tanggal Terima PO", workOrder.purchaseOrder?.customerPoDate ? formatDate(workOrder.purchaseOrder.customerPoDate) : "—"],
      ["Tanggal Terima Alat", "—"],
    ]);
    y += 16;

    // Equipment table
    y = equipmentTable(doc, left, y, width, workOrder.items, bottomLimit);
    y += 6;

    // Perlengkapan alat / Kerusakan Alat — no per-item accessory or damage data
    // exists in the domain model, so these print as "—" (mapping gap).
    y = ensureSpace(doc, y, 50, bottomLimit);
    doc.font("Helvetica").fontSize(9).fillColor(INK).text("Perlengkapan alat : —", left, y);
    y = doc.y + 6;
    doc.text("Kerusakan Alat : —", left, y);
    y = doc.y + 24;

    // Acknowledgement / signature
    y = ensureSpace(doc, y, 110, bottomLimit);
    doc.font("Helvetica").fontSize(9).fillColor(INK).text("Tanggal,", left, y);
    y = doc.y;
    doc.text("Mengetahui", left, y);
    y = doc.y + 56;
    doc.text("(", left, y);
    doc.moveTo(left + 10, y + 8).lineTo(left + 150, y + 8).strokeColor("#94a3b8").stroke();
    doc.text(")", left + 155, y);
    y += 26;

    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        "Catatan : Mohon mengisi dan menyertakan form ini secara lengkap pada saat mengirimkan " +
          "barang / alat ke Laboratorium Kalibrasi " +
          (company.legalName ?? company.name) +
          ".",
        left,
        y,
        { width },
      );

    const totalPages = drawFooterAllPages(doc, company);
    fillHalaman(doc, header.halaman, totalPages);
    doc.end();
  });
}

function sectionTitle(doc: PDFKit.PDFDocument, x: number, y: number, title: string): number {
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(title, x, y);
  return doc.y + 3;
}

/** Two-column bordered key/value table. */
function kvTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: Array<[string, string]>,
): number {
  const labelWidth = 150;
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

    doc.fillColor(MUTED).text(label, x + padX, top + padY, { width: labelWidth - padX * 2, lineGap: LINE_GAP });
    doc.fillColor(INK).text(value, x + labelWidth + padX, top + padY, {
      width: valueWidth - padX * 2,
      lineGap: LINE_GAP,
    });
    top += rowH;
  }
  doc.lineWidth(1);
  return top;
}

function equipmentTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  items: WorkOrderPdfSource["items"],
  bottomLimit: () => number,
): number {
  const cols = [
    { key: "no", label: "No", w: 34 },
    { key: "name", label: "Nama Alat", w: width - 34 - 90 - 90 - 110 },
    { key: "merk", label: "Merk", w: 90 },
    { key: "tipe", label: "Tipe", w: 90 },
    { key: "seri", label: "No. Seri", w: 110 },
  ];
  const padX = 4;
  const padY = 3;

  const drawHeaderRow = (top: number): number => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
    let cx = x;
    for (const c of cols) {
      doc.rect(cx, top, c.w, 16).fillAndStroke("#f1f5f9", BORDER);
      doc.fillColor(INK).text(c.label, cx + padX, top + 4, { width: c.w - padX * 2 });
      cx += c.w;
    }
    return top + 16;
  };

  let top = ensureSpace(doc, y, 40, bottomLimit);
  top = drawHeaderRow(top);

  doc.font("Helvetica").fontSize(8).fillColor(INK);
  if (items.length === 0) {
    doc.rect(x, top, width, 16).strokeColor(BORDER).lineWidth(0.7).stroke();
    doc.fillColor(MUTED).text("Tidak ada alat", x + padX, top + 4, { width: width - padX * 2 });
    doc.lineWidth(1);
    return top + 16;
  }

  items.forEach((item, index) => {
    const device = item.purchaseOrderItem.device;
    const requestItem = item.purchaseOrderItem.quotationItem.requestItem;
    const name = text(requestItem?.deviceType.name) ?? text(item.description) ?? "—";
    const merk = text(device?.brand) ?? "—";
    const tipe = text(device?.model) ?? "—";
    const seri = text(device?.serialNumber) ?? text(requestItem?.deviceId) ?? "—";
    const values = [String(index + 1), name, merk, tipe, seri];

    const rowH =
      Math.max(
        ...cols.map((c, i) =>
          doc.heightOfString(values[i], { width: c.w - padX * 2, lineGap: LINE_GAP }),
        ),
        10,
      ) + padY * 2;

    if (top + rowH > bottomLimit()) {
      doc.addPage();
      top = drawHeaderRow(doc.page.margins.top);
      doc.font("Helvetica").fontSize(8).fillColor(INK);
    }

    let cx = x;
    cols.forEach((c, i) => {
      doc.rect(cx, top, c.w, rowH).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.fillColor(INK).text(values[i], cx + padX, top + padY, {
        width: c.w - padX * 2,
        lineGap: LINE_GAP,
      });
      cx += c.w;
    });
    top += rowH;
  });
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

type HalamanCell = { x: number; y: number; w: number };

function drawHeader(
  doc: PDFKit.PDFDocument,
  left: number,
  right: number,
): { bottom: number; halaman: HalamanCell } {
  const top = doc.y;
  const width = right - left;
  const logoW = 120;
  const metaW = 190;
  const titleW = width - logoW - metaW;
  const rowH = 15;
  const boxH = rowH * (FORM_META.length + 1); // + Halaman row

  // outer box
  doc.rect(left, top, width, boxH).strokeColor(BORDER).lineWidth(0.8).stroke();
  doc.moveTo(left + logoW, top).lineTo(left + logoW, top + boxH).stroke();
  doc.moveTo(left + logoW + titleW, top).lineTo(left + logoW + titleW, top + boxH).stroke();

  const pkmLogo = resolvePkmLogoPath();
  if (pkmLogo) {
    try {
      doc.image(pkmLogo, left + 8, top + (boxH - 34) / 2, { fit: [logoW - 16, 34] });
    } catch {
      /* continue */
    }
  }

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text("FORMULIR", left + logoW, top + 8, { width: titleW, align: "center" });
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(INK)
    .text("Work Order", left + logoW, top + boxH / 2 - 2, { width: titleW, align: "center" });

  const metaX = left + logoW + titleW;
  const rows: Array<[string, string]> = [...FORM_META, ["Halaman", ""]];
  rows.forEach(([k, v], i) => {
    const ry = top + i * rowH;
    if (i > 0) doc.moveTo(metaX, ry).lineTo(right, ry).strokeColor(BORDER).lineWidth(0.6).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(k, metaX + 4, ry + 3.5, { width: 78 });
    if (v) doc.fillColor(INK).text(`: ${v}`, metaX + 84, ry + 3.5, { width: metaW - 88 });
  });

  doc.lineWidth(1);
  return {
    bottom: top + boxH,
    halaman: { x: metaX + 84, y: top + FORM_META.length * rowH + 3.5, w: metaW - 88 },
  };
}

/** Fill the header "Halaman" cell once the total page count is known. */
function fillHalaman(doc: PDFKit.PDFDocument, cell: HalamanCell, totalPages: number) {
  const range = doc.bufferedPageRange();
  doc.switchToPage(range.start);
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(INK)
    .text(`: 1 dari ${totalPages}`, cell.x, cell.y, { width: cell.w });
}

function drawFooterAllPages(
  doc: PDFKit.PDFDocument,
  company: { name: string; legalName: string | null },
): number {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom - 30;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(INK).stroke();
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(MUTED)
      .text(`Halaman ${i - range.start + 1} dari ${range.count}`, left, y + 4, {
        width: right - left,
        align: "right",
      });
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
  return range.count;
}
