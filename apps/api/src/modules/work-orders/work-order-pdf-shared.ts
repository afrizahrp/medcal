import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Company, Prisma } from "@medcal/db";
import { quotationPdfFilename } from "../quotations/quotation-pdf";

/**
 * Work Order documents — two physically distinct forms, one per service mode:
 *
 *   ON_SITE      -> "Surat Perintah Kerja" (SPK)  — see work-order-pdf-spk.ts
 *   SEND_TO_LAB  -> "Formulir Work Order" (WOL)    — see work-order-pdf-wol.ts
 *
 * ON_SITE additionally gets a "Surat Jalan Alat" later (equipment transported to
 * the customer). That document is NOT implemented here. SEND_TO_LAB has no Surat
 * Jalan.
 *
 * Layout authorities (physical documents supplied by the business):
 *   SPK -> apps/portal/public/SPK.jpeg
 *   WOL -> apps/portal/public/work-order.jpeg  (form code F.MU.07)
 */

/** Letterhead address — matches the printed footer on the physical documents. */
export const PKM_LETTERHEAD_ADDRESS_LINES = [
  "Gedung Graha Bumi Indah - Lantai 3, Jl. Inspeksi Kalimalang Kavling Agraria",
  "Blok E No. 10, Kel. Duren Sawit, Kec. Duren Sawit, Jakarta Timur, DKI Jakarta",
] as const;

/** Accreditation identifier printed under the KAN logo on the SPK. */
export const KAN_ACCREDITATION_CODE = "LK-521-IDN";

export const SERVICE_MODE_LABELS: Record<string, string> = {
  ON_SITE: "On Site",
  SEND_TO_LAB: "In Lab",
};

export const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const ROLE_LABELS: Record<string, string> = {
  LEAD: "Lead",
  ASSIST: "Assist",
};

function resolveAssetPath(fileName: string): string | null {
  const candidates = [
    join(__dirname, "../../../assets", fileName),
    join(process.cwd(), "assets", fileName),
    join(process.cwd(), "../portal/public", fileName),
    join(process.cwd(), "../web/public", fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Official PKM logo (apps/api/assets/logo.png). */
export function resolvePkmLogoPath(): string | null {
  return resolveAssetPath("logo.png");
}

/** Official KAN accreditation logo (apps/api/assets/KAN-logo.png). */
export function resolveKanLogoPath(): string | null {
  return resolveAssetPath("KAN-logo.png");
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
    mobile?: string | null;
    email: string | null;
    taxId: string | null;
    contacts?: Array<{
      name: string;
      isPrimary: boolean;
      email?: string | null;
      phone?: string | null;
      title?: string | null;
    }>;
  };
  purchaseOrder: {
    number: string;
    customerPoNumber: string;
    customerPoDate?: Date | null;
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
          deviceId: string | null;
          /** Customer's own wording for the device — printed above the master name (MoM #3). */
          customerDeviceName?: string | null;
          deviceType: { name: string };
        } | null;
      };
      device: { brand: string | null; model: string | null; serialNumber: string | null } | null;
    };
  }>;
};

export type WorkOrderPdfResult = {
  buffer: Buffer;
  filename: string;
};

export type WorkOrderPdfInput = {
  workOrder: WorkOrderPdfSource;
  company: Company;
};

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(value: Date | string | null | undefined): string {
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

export function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * "Nama Alat" cell content for one printed device row: the customer-given alias
 * on the first line, the MEDCAL master name underneath it (MoM #3). Duplicates
 * are dropped, and when neither name exists the caller's fallback (the line
 * description) is printed alone — never an empty cell.
 */
export function deviceNameCell(input: {
  customerDeviceName?: string | null;
  deviceTypeName?: string | null;
  fallback?: string | null;
}): string {
  const lines: string[] = [];
  for (const name of [input.customerDeviceName, input.deviceTypeName]) {
    const trimmed = text(name);
    if (trimmed && !lines.includes(trimmed)) lines.push(trimmed);
  }
  if (lines.length === 0) return text(input.fallback) ?? "—";
  return lines.join("\n");
}

/** Primary contact for the customer, falling back to the first listed contact. */
export function primaryContact(customer: WorkOrderPdfSource["customer"]) {
  const contacts = customer.contacts ?? [];
  return contacts.find((contact) => contact.isPrimary) ?? contacts[0] ?? null;
}

export function workOrderPdfFilename(input: {
  number: string;
  companyId: string;
  issuedAt: Date | string;
}): string {
  return quotationPdfFilename(input);
}
