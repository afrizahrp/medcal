import PDFDocument from "pdfkit";
import {
  PKM_LETTERHEAD_ADDRESS_LINES,
  formatDate,
  resolvePkmLogoPath,
  text,
} from "../work-orders/work-order-pdf-shared";

const MARGIN = 45;
const INK = "#0f172a";
const MUTED = "#475569";
const BORDER = "#334155";
const LINE_GAP = 1;

/** Static form metadata — F.MU.08 Kontrol Alat (Formulir Intake Kalibrasi In Lab). */
const FORM_META: Array<[string, string]> = [
  ["Kode Dokumen", "F.MU.08"],
  ["Edisi/Revisi", "01/00"],
  ["Tanggal Edisi", "13-01-2025"],
  ["Tanggal Revisi", "-"],
];

export interface KontrolAlatPdfInput {
  company: {
    id: string;
    name: string;
    legalName: string | null;
  };
  job: {
    unitOrdinal: number;
    unitTotal: number;
    startedAt: Date | null;
    submittedAt: Date | null;
    /** Brand of the device, if identified. */
    deviceBrand: string | null;
    /** Model / type of the device, if identified. */
    deviceModel: string | null;
    /** Serial number of the device, if identified. */
    deviceSerial: string | null;
    /** Resolved device type name. */
    deviceTypeName: string | null;
  };
  workOrder: {
    number: string;
    customer: { name: string };
    purchaseOrder: { customerPoNumber: string } | null;
    requestReviewMethodOk: boolean | null;
    requestReviewEquipmentOk: boolean | null;
    requestReviewPersonnelOk: boolean | null;
    requestReviewConfirmAgree: boolean;
    requestReviewConfirmEmail: boolean;
    requestReviewConfirmLetter: boolean;
    requestReviewConfirmOther: boolean;
    requestReviewConfirmOtherText: string | null;
    requestReviewCompletedAt: Date | null;
    requestReviewCompletedBy: { name: string | null } | null;
  };
  kontrolAlat: {
    workExecuted: boolean | null;
    notExecutedReason: string | null;
    capacity: string | null;
    visualPowerCable: boolean | null;
    visualDisplay: boolean | null;
    visualButtons: boolean | null;
    functionInitialOk: boolean | null;
    functionFinalOk: boolean | null;
    certificateNumber: string | null;
    completedAt: Date | null;
    accessories: Array<{ label: string; present: boolean | null; sortOrder: number }>;
    signatures: Array<{ signerKind: string; signerName: string; signedAt: Date | null }>;
  };
  /** Tanggal Selesai — APPROVED QualityReview.reviewedAt, or submittedAt if not yet reviewed. */
  completedAt: Date | null;
}

export interface KontrolAlatPdfResult {
  buffer: Buffer;
  filename: string;
}

function triState(value: boolean | null): string {
  if (value === true) return "Ya / OK";
  if (value === false) return "Tidak";
  return "—";
}

/** Render PDF F.MU.08 — Kontrol Alat (Formulir Intake Kalibrasi In Lab). */
export function renderKontrolAlatPdf(
  input: KontrolAlatPdfInput,
): Promise<KontrolAlatPdfResult> {
  const { company, job, workOrder, kontrolAlat, completedAt } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: `F.MU.08-${workOrder.number.replace(/\//g, "-")}-Unit${job.unitOrdinal}.pdf`,
      });
    });

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 40;

    const header = drawHeader(doc, left, right);
    let y = header.bottom + 14;

    // ── Keterangan umum / identitas job ──────────────────────────────────────

    y = kvTable(doc, left, y, width, [
      ["No. Order", text(workOrder.purchaseOrder?.customerPoNumber) ?? "—"],
      ["No. Sertifikat", text(kontrolAlat.certificateNumber) ?? "—"],
      ["No. Work Order", workOrder.number],
      ["Unit", `${job.unitOrdinal} dari ${job.unitTotal}`],
      ["Tgl. Terima Alat", formatDate(job.startedAt)],
      ["Tgl. Kalibrasi", formatDate(job.startedAt)],
      ["Tgl. Selesai", formatDate(completedAt ?? job.submittedAt)],
    ]);
    y += 12;

    // ── I. Pelaksanaan Pekerjaan ──────────────────────────────────────────────

    y = ensureSpace(doc, y, 60, bottomLimit);
    y = sectionTitle(doc, left, y, "I. Pelaksanaan Pekerjaan (Kalibrasi In Lab)");
    y = kvTable(doc, left, y, width, [
      ["Pekerjaan dilaksanakan", triState(kontrolAlat.workExecuted)],
      ...(kontrolAlat.workExecuted === false && kontrolAlat.notExecutedReason
        ? ([["Alasan", kontrolAlat.notExecutedReason]] as Array<[string, string]>)
        : []),
    ]);
    y += 12;

    // ── II. Kaji Ulang Permintaan ─────────────────────────────────────────────

    y = ensureSpace(doc, y, 80, bottomLimit);
    y = sectionTitle(doc, left, y, "II. Kaji Ulang Permintaan");

    const confirmList = [
      workOrder.requestReviewConfirmAgree && "Persetujuan langsung",
      workOrder.requestReviewConfirmEmail && "Email",
      workOrder.requestReviewConfirmLetter && "Surat resmi",
      workOrder.requestReviewConfirmOther &&
        (text(workOrder.requestReviewConfirmOtherText) ?? "Lainnya"),
    ]
      .filter(Boolean)
      .join(", ");

    y = kvTable(doc, left, y, width, [
      ["Metode kalibrasi sesuai", triState(workOrder.requestReviewMethodOk)],
      ["Peralatan tersedia dan sesuai", triState(workOrder.requestReviewEquipmentOk)],
      ["Personel kompeten tersedia", triState(workOrder.requestReviewPersonnelOk)],
      ["Konfirmasi persetujuan customer", confirmList || "—"],
      [
        "Kaji ulang selesai",
        workOrder.requestReviewCompletedAt
          ? `${formatDate(workOrder.requestReviewCompletedAt)}${workOrder.requestReviewCompletedBy?.name ? ` oleh ${workOrder.requestReviewCompletedBy.name}` : ""}`
          : "Belum",
      ],
    ]);
    y += 12;

    // ── III. Identitas Alat ───────────────────────────────────────────────────

    y = ensureSpace(doc, y, 80, bottomLimit);
    y = sectionTitle(doc, left, y, "III. Identitas Alat");
    y = kvTable(doc, left, y, width, [
      ["Nama Alat / Jenis", text(job.deviceTypeName) ?? "—"],
      ["Merk", text(job.deviceBrand) ?? "—"],
      ["Tipe / Model", text(job.deviceModel) ?? "—"],
      ["No. Seri", text(job.deviceSerial) ?? "—"],
      ["Kapasitas / Range", text(kontrolAlat.capacity) ?? "—"],
      ["Instansi / Pemilik", workOrder.customer.name],
    ]);
    y += 12;

    // ── IV. Uji Visual ────────────────────────────────────────────────────────

    y = ensureSpace(doc, y, 80, bottomLimit);
    y = sectionTitle(doc, left, y, "IV. Pemeriksaan Kondisi Fisik");

    const halfW = width / 2;
    y = twoColTable(doc, left, y, halfW, [
      ["Kabel daya / power supply", triState(kontrolAlat.visualPowerCable)],
      ["Layar / display", triState(kontrolAlat.visualDisplay)],
      ["Tombol / kontrol", triState(kontrolAlat.visualButtons)],
      ["Uji fungsi awal (sebelum kalibrasi)", triState(kontrolAlat.functionInitialOk)],
      ["Uji fungsi akhir (setelah kalibrasi)", triState(kontrolAlat.functionFinalOk)],
    ]);
    y += 12;

    // ── Perlengkapan ──────────────────────────────────────────────────────────

    y = ensureSpace(doc, y, 40, bottomLimit);
    y = sectionTitle(doc, left, y, "Perlengkapan");

    if (kontrolAlat.accessories.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("—", left, y);
      y = doc.y + 8;
    } else {
      const accessoryRows: Array<[string, string]> = kontrolAlat.accessories.map((acc) => [
        acc.label,
        acc.present === true ? "Ada" : acc.present === false ? "Tidak Ada" : "—",
      ]);
      y = kvTable(doc, left, y, width, accessoryRows);
      y += 12;
    }

    // ── Tanda Tangan ─────────────────────────────────────────────────────────

    y = ensureSpace(doc, y, 120, bottomLimit);
    y = sectionTitle(doc, left, y, "Tanda Tangan");

    const adminSig = kontrolAlat.signatures.find((s) => s.signerKind === "ADMINISTRATION");
    const techSig = kontrolAlat.signatures.find((s) => s.signerKind === "TECHNICAL_OFFICER");

    const sigBlockW = (width - 16) / 2;
    drawSignatureBlock(doc, left, y, sigBlockW, "Administrasi", adminSig ?? null);
    drawSignatureBlock(doc, left + sigBlockW + 16, y, sigBlockW, "Petugas Teknis", techSig ?? null);
    y += 90;

    // ── Footer ────────────────────────────────────────────────────────────────
    const totalPages = drawFooterAllPages(doc, company);
    fillHalaman(doc, header.halaman, totalPages);
    doc.end();
  });
}

// ── Drawing primitives ────────────────────────────────────────────────────────

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
  const labelWidth = 175;
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

/** Two-column table where each row spans half the page width. */
function twoColTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  colWidth: number,
  rows: Array<[string, string]>,
): number {
  const labelW = colWidth * 0.7;
  const valueW = colWidth - labelW;
  const padX = 4;
  const padY = 3;
  let top = y;

  doc.font("Helvetica").fontSize(9);
  for (const [label, value] of rows) {
    const rowH =
      Math.max(
        doc.heightOfString(label, { width: labelW - padX * 2, lineGap: LINE_GAP }),
        doc.heightOfString(value, { width: valueW - padX * 2, lineGap: LINE_GAP }),
      ) +
      padY * 2;

    const totalW = labelW + valueW;
    doc.rect(x, top, labelW, rowH).strokeColor(BORDER).lineWidth(0.7).stroke();
    doc.rect(x + labelW, top, valueW, rowH).strokeColor(BORDER).lineWidth(0.7).stroke();

    doc.fillColor(MUTED).text(label, x + padX, top + padY, {
      width: labelW - padX * 2,
      lineGap: LINE_GAP,
    });
    doc.fillColor(INK).text(value, x + labelW + padX, top + padY, {
      width: valueW - padX * 2,
      lineGap: LINE_GAP,
    });

    // Right portion of row stays blank (single column layout — easier to read)
    void totalW;
    top += rowH;
  }
  doc.lineWidth(1);
  return top;
}

function drawSignatureBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  role: string,
  sig: {
    signerName: string;
    signedAt: Date | null;
  } | null,
): void {
  const padX = 6;
  const h = 80;
  doc.rect(x, y, w, h).strokeColor(BORDER).lineWidth(0.7).stroke();

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(role, x + padX, y + 6, {
    width: w - padX * 2,
    align: "center",
  });

  if (sig?.signedAt) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(INK)
      .text(sig.signerName, x + padX, y + 22, { width: w - padX * 2, align: "center" });
    doc.fillColor(MUTED).text(formatDate(sig.signedAt), x + padX, doc.y + 2, {
      width: w - padX * 2,
      align: "center",
    });
  } else {
    // Signature blank line
    const lineY = y + h - 24;
    doc
      .moveTo(x + padX, lineY)
      .lineTo(x + w - padX, lineY)
      .strokeColor("#94a3b8")
      .lineWidth(0.5)
      .stroke();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("Belum ditandatangani", x + padX, lineY + 3, {
      width: w - padX * 2,
      align: "center",
    });
    doc.lineWidth(1);
  }
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
  const boxH = rowH * (FORM_META.length + 1);

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
    .fontSize(12)
    .fillColor(INK)
    .text("Kontrol Alat (Kalibrasi In Lab)", left + logoW, top + boxH / 2 - 4, {
      width: titleW,
      align: "center",
    });

  const metaX = left + logoW + titleW;
  const rows: Array<[string, string]> = [...FORM_META, ["Halaman", ""]];
  rows.forEach(([k, v], i) => {
    const ry = top + i * rowH;
    if (i > 0) doc.moveTo(metaX, ry).lineTo(right, ry).strokeColor(BORDER).lineWidth(0.6).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(k, metaX + 4, ry + 3.5, {
      width: 78,
    });
    if (v) doc.fillColor(INK).text(`: ${v}`, metaX + 84, ry + 3.5, { width: metaW - 88 });
  });

  doc.lineWidth(1);
  return {
    bottom: top + boxH,
    halaman: { x: metaX + 84, y: top + FORM_META.length * rowH + 3.5, w: metaW - 88 },
  };
}

function fillHalaman(doc: PDFKit.PDFDocument, cell: HalamanCell, totalPages: number): void {
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
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(
      `Halaman ${i - range.start + 1} dari ${range.count}`,
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
  return range.count;
}
