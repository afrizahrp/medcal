import PDFDocument from "pdfkit";
import {
  KAN_ACCREDITATION_CODE,
  PKM_LETTERHEAD_ADDRESS_LINES,
  ROLE_LABELS,
  formatDate,
  resolveKanLogoPath,
  resolvePkmLogoPath,
  text,
  workOrderPdfFilename,
  type WorkOrderPdfInput,
  type WorkOrderPdfResult,
  type WorkOrderPdfSource,
} from "./work-order-pdf-shared";

const MARGIN = 50;
const INK = "#0f172a";
const MUTED = "#475569";

/**
 * On Site Work Order — "SURAT PERINTAH KERJA" (SPK).
 * Layout authority: apps/portal/public/SPK.jpeg
 *
 * Mapping gaps (no reliable source in the current domain model — values are
 * NOT invented, the label is printed with a blank/placeholder):
 *   - Technician "Jabatan": User has no job-title field. Printed as "Teknisi"
 *     (every Work Order assignee is a technician; this is the role, not invented data).
 *   - Authorised signatory name: no signatory is configured on Company. The
 *     signature block prints the title only ("Manager Teknis") with space for a
 *     wet signature + name.
 */
export function renderSpkPdf(input: WorkOrderPdfInput): Promise<WorkOrderPdfResult> {
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
    const contentWidth = right - left;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 90; // keep clear of footer

    let y = drawLetterhead(doc, company, left, right);

    // Title
    y += 18;
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(INK)
      .text("SURAT PERINTAH KERJA", left, y, { width: contentWidth, align: "center" });
    y = doc.y + 10;

    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(`Tanggal: ${formatDate(workOrder.createdAt)}`, left, y, {
      width: contentWidth,
      align: "right",
    });
    y = doc.y + 12;

    doc.text(`Nomor: ${workOrder.number}`, left, y);
    y = doc.y;
    const refs = [
      workOrder.purchaseOrder ? `PO ${workOrder.purchaseOrder.number}` : null,
      `Quotation ${workOrder.quotation.number}`,
      workOrder.quotation.request?.number
        ? `Requisition ${workOrder.quotation.request.number}`
        : null,
    ].filter(Boolean);
    if (refs.length > 0) {
      doc.fontSize(8).fillColor(MUTED).text(refs.join("  ·  "), left, y);
      y = doc.y;
      doc.fontSize(10).fillColor(INK);
    }
    y += 16;

    // Addressee
    doc.font("Helvetica").fontSize(10).text("Kepada Yth.", left, y);
    y = doc.y + 2;
    doc.font("Helvetica-Bold").text(workOrder.customer.name, left, y, { width: contentWidth });
    y = doc.y;
    doc.font("Helvetica");
    const address = text(workOrder.customer.address);
    if (address) {
      doc.text(address, left, y, { width: contentWidth });
      y = doc.y;
    }
    y += 12;

    // Body — opening
    const customerPo = workOrder.purchaseOrder
      ? text(workOrder.purchaseOrder.customerPoNumber) ?? workOrder.purchaseOrder.number
      : null;
    const opening = customerPo
      ? `Sehubungan dengan adanya permintaan kalibrasi sesuai dengan PO. ${customerPo} dari ${workOrder.customer.name}`
      : `Sehubungan dengan adanya permintaan kalibrasi dari ${workOrder.customer.name}`;
    doc.text(opening, left, y, { width: contentWidth });
    y = doc.y + 4;
    doc.text("Kami menugaskan :", left, y);
    y = doc.y + 10;

    // Assigned technicians
    const assignments = orderAssignments(workOrder.assignments);
    if (assignments.length === 0) {
      doc.font("Helvetica-Oblique").fillColor(MUTED).text("Teknisi belum di-assign", left + 10, y);
      doc.font("Helvetica").fillColor(INK);
      y = doc.y + 6;
    } else {
      for (const assignment of assignments) {
        const name = text(assignment.technician.name) ?? assignment.technician.email;
        const roleSuffix =
          assignment.roleOnJob && assignment.roleOnJob !== "LEAD"
            ? ` (${ROLE_LABELS[assignment.roleOnJob] ?? assignment.roleOnJob})`
            : "";
        y = labelRow(doc, left, y, "Nama", `${name}${roleSuffix}`, contentWidth);
        y = labelRow(doc, left, y, "Jabatan", "Teknisi", contentWidth);
        y = labelRow(doc, left, y, "Instansi", company.name, contentWidth);
        y += 8;
      }
    }

    doc.text("Untuk melakukan serangkaian kegiatan kalibrasi di :", left, y, {
      width: contentWidth,
    });
    y = doc.y + 10;

    const tempat = text(workOrder.addressText) ?? workOrder.customer.name;
    y = labelRow(doc, left, y, "Tempat", tempat, contentWidth);
    y = labelRow(
      doc,
      left,
      y,
      "Tanggal",
      formatDate(workOrder.scheduledStart ?? workOrder.createdAt),
      contentWidth,
    );
    if (text(workOrder.locationNotes)) {
      y = labelRow(doc, left, y, "Catatan", workOrder.locationNotes!.trim(), contentWidth);
    }
    y += 14;

    doc.text(
      "Agar yang bersangkutan melaksanakan tugas dengan baik dan penuh tanggung jawab. " +
        "Demikian surat perintah kerja ini dibuat harap digunakan sesuai dengan mestinya.",
      left,
      y,
      { width: contentWidth },
    );
    y = doc.y + 16;

    doc.font("Helvetica").text("Note ;", left, y);
    y = doc.y;
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text("*PO/Penawaran Terlampir", left, y);
    doc.font("Helvetica").fontSize(10).fillColor(INK);
    y = doc.y + 24;

    // Signature block (keep intact — move to next page if it would collide with footer)
    const signatureHeight = 96;
    if (y + signatureHeight > bottomLimit) {
      doc.addPage();
      y = MARGIN;
    }
    const sigX = right - 220;
    doc.text("Laboratorium Kalibrasi", sigX, y, { width: 220 });
    y = doc.y;
    doc.text(company.name, sigX, y, { width: 220 });
    y = doc.y + 58; // space for wet signature + handwritten name
    doc.moveTo(sigX, y).lineTo(sigX + 180, y).strokeColor("#94a3b8").stroke();
    y += 4;
    doc.font("Helvetica-Bold").text("Manager Teknis", sigX, y, { width: 220 });
    doc.font("Helvetica");

    drawFooterAllPages(doc, company);
    doc.end();
  });
}

function orderAssignments(assignments: WorkOrderPdfSource["assignments"]) {
  return [...assignments].sort((a, b) => {
    const rank = (role: string) => (role === "LEAD" ? 0 : 1);
    return rank(a.roleOnJob) - rank(b.roleOnJob);
  });
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
  const labelWidth = 90;
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

function drawFooterAllPages(doc: PDFKit.PDFDocument, company: { name: string; legalName: string | null }) {
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
