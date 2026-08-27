import { existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { Company, Prisma } from "@medcal/db";
import {
  QUOTATION_LETTERHEAD_ADDRESS_LINES,
  quotationAddresseeLine,
  quotationPdfFilename,
} from "../quotations/quotation-pdf";

const LETTERHEAD_LOGO_WIDTH = 120;
const LETTERHEAD_LOGO_MAX_HEIGHT = 56;

const SERVICE_MODE_LABELS: Record<string, string> = {
  ON_SITE: "On Site",
  SEND_TO_LAB: "Send to Lab",
};

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const ROLE_LABELS: Record<string, string> = {
  LEAD: "Lead",
  ASSIST: "Assist",
};

function resolveLetterheadLogoPath(): string | null {
  const candidates = [
    join(__dirname, "../../../assets/logo.png"),
    join(process.cwd(), "assets/logo.png"),
    join(process.cwd(), "../portal/public/logo.png"),
    join(process.cwd(), "../web/public/logo.png"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export type WorkOrderPdfSource = {
  number: string;
  createdAt: Date;
  status: string;
  serviceMode: string;
  addressText: string | null;
  locationNotes: string | null;
  geoLat: number | null;
  geoLng: number | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  customer: {
    name: string;
    number: string;
    legalName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
    contacts?: Array<{
      name: string;
      isPrimary: boolean;
    }>;
  };
  purchaseOrder: {
    number: string;
    customerPoNumber: string;
  } | null;
  quotation: {
    number: string;
    request?: { number: string } | null;
  };
  assignments: Array<{
    roleOnJob: string;
    technician: { name: string | null; email: string };
  }>;
  items: Array<{
    description: string;
    qty: Prisma.Decimal | string | number;
    purchaseOrderItem: {
      quotationItem: {
        requestItem: {
          deviceId: string;
          deviceType: { name: string };
        } | null;
      };
      device: { serialNumber: string | null } | null;
    };
  }>;
};

export type WorkOrderPdfResult = {
  buffer: Buffer;
  filename: string;
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function line(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function deviceIdentifier(item: WorkOrderPdfSource["items"][number]): string | null {
  return (
    line(item.purchaseOrderItem.quotationItem.requestItem?.deviceId) ??
    line(item.purchaseOrderItem.device?.serialNumber)
  );
}

export function workOrderPdfFilename(input: {
  number: string;
  companyId: string;
  issuedAt: Date | string;
}): string {
  return quotationPdfFilename(input);
}

export function renderWorkOrderPdf(input: {
  workOrder: WorkOrderPdfSource;
  company: Company;
}): Promise<WorkOrderPdfResult> {
  const { workOrder, company } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
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

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.y;

    const logoPath = resolveLetterheadLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, 50, y, {
          fit: [LETTERHEAD_LOGO_WIDTH, LETTERHEAD_LOGO_MAX_HEIGHT],
        });
        y += LETTERHEAD_LOGO_MAX_HEIGHT + 10;
      } catch {
        // Continue without logo if the image cannot be embedded.
      }
    }

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text(company.name, 50, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    for (const value of [
      line(company.legalName),
      ...QUOTATION_LETTERHEAD_ADDRESS_LINES,
      [line(company.phone), line(company.email)].filter(Boolean).join(" · ") || null,
      company.taxId ? `NPWP ${company.taxId}` : null,
    ]) {
      if (!value) continue;
      doc.text(value, 50, y, { width: pageWidth });
      y = doc.y;
    }

    y += 16;
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text("WORK ORDER", 50, y);
    y = doc.y + 8;
    doc.font("Helvetica").fontSize(10);
    doc.text(`SPK Number: ${workOrder.number}`, 50, y);
    y = doc.y;
    doc.text(`Tanggal: ${formatDate(workOrder.createdAt)}`, 50, y);
    y = doc.y;
    doc.text(`Status: ${STATUS_LABELS[workOrder.status] ?? workOrder.status}`, 50, y);
    y = doc.y;
    doc.text(
      `Service Mode: ${SERVICE_MODE_LABELS[workOrder.serviceMode] ?? workOrder.serviceMode}`,
      50,
      y,
    );
    y = doc.y + 12;

    doc.font("Helvetica-Bold").fontSize(10).text("Kepada", 50, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
    doc.text(quotationAddresseeLine(workOrder.customer), 50, y, { width: pageWidth });
    y = doc.y;
    doc.text(workOrder.customer.name, 50, y, { width: pageWidth });
    y = doc.y;

    y += 10;
    doc.font("Helvetica").fontSize(10);
    if (workOrder.purchaseOrder) {
      doc.text(`Purchase Order: ${workOrder.purchaseOrder.number}`, 50, y);
      y = doc.y;
      doc.text(`Customer PO No: ${workOrder.purchaseOrder.customerPoNumber}`, 50, y);
      y = doc.y;
    }
    doc.text(`Quotation: ${workOrder.quotation.number}`, 50, y);
    y = doc.y;
    if (workOrder.quotation.request?.number) {
      doc.text(`Calibration Requisition: ${workOrder.quotation.request.number}`, 50, y);
      y = doc.y;
    }
    y += 12;

    doc.font("Helvetica-Bold").fontSize(10).text("Lokasi & Jadwal", 50, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(10);
    doc.text(`Alamat: ${line(workOrder.addressText) ?? "—"}`, 50, y, { width: pageWidth });
    y = doc.y;
    if (workOrder.locationNotes?.trim()) {
      doc.text(`Catatan lokasi: ${workOrder.locationNotes.trim()}`, 50, y, { width: pageWidth });
      y = doc.y;
    }
    if (workOrder.geoLat != null && workOrder.geoLng != null) {
      doc.text(`Koordinat: ${workOrder.geoLat}, ${workOrder.geoLng}`, 50, y);
      y = doc.y;
    }
    doc.text(`Scheduled Start: ${formatDateTime(workOrder.scheduledStart)}`, 50, y);
    y = doc.y;
    doc.text(`Scheduled End: ${formatDateTime(workOrder.scheduledEnd)}`, 50, y);
    y = doc.y + 12;

    doc.font("Helvetica-Bold").fontSize(10).text("Teknisi", 50, y);
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(10);
    if (workOrder.assignments.length === 0) {
      doc.text("Belum di-assign", 50, y);
      y = doc.y;
    } else {
      for (const assignment of workOrder.assignments) {
        const name = line(assignment.technician.name) ?? assignment.technician.email;
        const role = ROLE_LABELS[assignment.roleOnJob] ?? assignment.roleOnJob;
        doc.text(`${name} (${role})`, 50, y, { width: pageWidth });
        y = doc.y;
      }
    }
    y += 14;

    const cols = {
      desc: 50,
      device: 320,
      qty: 470,
    };
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
    doc.text("DESKRIPSI", cols.desc, y, { width: 260 });
    doc.text("DEVICE ID", cols.device, y, { width: 140 });
    doc.text("QTY", cols.qty, y, { width: 75, align: "right" });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e2e8f0").stroke();
    y += 8;

    doc.fillColor("#0f172a").font("Helvetica").fontSize(9);
    for (const item of workOrder.items) {
      const deviceName = item.purchaseOrderItem.quotationItem.requestItem?.deviceType.name;
      const descLines = [item.description];
      if (deviceName && deviceName !== item.description) descLines.push(deviceName);

      const descHeight = doc.heightOfString(descLines.join("\n"), { width: 260 });
      if (y + descHeight > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }

      doc.text(descLines.join("\n"), cols.desc, y, { width: 260 });
      const rowY = y;
      doc.text(deviceIdentifier(item) ?? "—", cols.device, rowY, { width: 140 });
      doc.text(String(item.qty), cols.qty, rowY, { width: 75, align: "right" });
      y += Math.max(descHeight, 16) + 8;
    }

    doc.end();
  });
}
