import { ApiError } from "@medcal/shared";
import type { WorkOrderAssignInput, WorkOrderCreateInput, WorkOrderUpdateInput } from "@medcal/shared";

export type WorkOrderStatus = "PLANNED" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type AssignmentRole = "LEAD" | "ASSIST";

export const WORK_ORDER_STATUS_VALUES: WorkOrderStatus[] = [
  "PLANNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
];

export function isActiveWorkOrderStatus(status: string): boolean {
  return status !== "CANCELLED";
}

export function findActiveWorkOrder<T extends { status: string }>(rows: T[]): T | undefined {
  return rows.find((row) => isActiveWorkOrderStatus(row.status));
}

export function canCreateWorkOrderFromPurchaseOrder(purchaseOrder: { status: string }): boolean {
  return purchaseOrder.status === "APPROVED";
}

export function isWorkOrderTerminal(status: string): boolean {
  return status === "DONE" || status === "CANCELLED";
}

export function workOrderActions(status: string): {
  canEdit: boolean;
  canAssign: boolean;
  canStart: boolean;
  canDone: boolean;
  canCancel: boolean;
  isLocked: boolean;
} {
  if (status === "PLANNED") {
    return {
      canEdit: true,
      canAssign: true,
      canStart: false,
      canDone: false,
      canCancel: true,
      isLocked: false,
    };
  }
  if (status === "ASSIGNED") {
    return {
      canEdit: true,
      canAssign: false,
      canStart: true,
      canDone: false,
      canCancel: true,
      isLocked: false,
    };
  }
  if (status === "IN_PROGRESS") {
    return {
      canEdit: true,
      canAssign: false,
      canStart: false,
      canDone: true,
      canCancel: true,
      isLocked: false,
    };
  }
  return {
    canEdit: false,
    canAssign: false,
    canStart: false,
    canDone: false,
    canCancel: false,
    isLocked: true,
  };
}

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseOptionalCoord(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildWorkOrderCreatePayload(input: {
  purchaseOrderId: string;
  addressText: string;
  geoLat: string;
  geoLng: string;
  locationNotes: string;
  scheduledStart: string;
  scheduledEnd: string;
}): WorkOrderCreateInput {
  return {
    purchaseOrderId: input.purchaseOrderId,
    addressText: emptyToNull(input.addressText),
    geoLat: parseOptionalCoord(input.geoLat),
    geoLng: parseOptionalCoord(input.geoLng),
    locationNotes: emptyToNull(input.locationNotes),
    scheduledStart: fromDatetimeLocalValue(input.scheduledStart),
    scheduledEnd: fromDatetimeLocalValue(input.scheduledEnd),
  };
}

export function buildWorkOrderUpdatePayload(input: {
  addressText: string;
  geoLat: string;
  geoLng: string;
  locationNotes: string;
  scheduledStart: string;
  scheduledEnd: string;
}): WorkOrderUpdateInput {
  // serviceMode is immutable after create (it determines SPK vs WOL) — not sent.
  return {
    addressText: emptyToNull(input.addressText),
    geoLat: parseOptionalCoord(input.geoLat),
    geoLng: parseOptionalCoord(input.geoLng),
    locationNotes: emptyToNull(input.locationNotes),
    scheduledStart: fromDatetimeLocalValue(input.scheduledStart),
    scheduledEnd: fromDatetimeLocalValue(input.scheduledEnd),
  };
}

export function buildWorkOrderAssignPayload(
  technicians: Array<{ technicianUserId: string; roleOnJob: AssignmentRole }>,
): WorkOrderAssignInput {
  return {
    technicians: technicians.map((row) => ({
      technicianUserId: row.technicianUserId,
      roleOnJob: row.roleOnJob,
    })),
  };
}

export function validateWorkOrderOperationalForm(input: {
  addressText: string;
  geoLat: string;
  geoLng: string;
  locationNotes: string;
  scheduledStart: string;
  scheduledEnd: string;
}): string | null {
  if (input.addressText.length > 2000) return "Alamat maksimal 2000 karakter.";
  if (input.locationNotes.length > 2000) return "Catatan lokasi maksimal 2000 karakter.";
  if (input.geoLat.trim() && !Number.isFinite(parseOptionalCoord(input.geoLat))) {
    return "Latitude tidak valid.";
  }
  if (input.geoLng.trim() && !Number.isFinite(parseOptionalCoord(input.geoLng))) {
    return "Longitude tidak valid.";
  }
  const start = fromDatetimeLocalValue(input.scheduledStart);
  const end = fromDatetimeLocalValue(input.scheduledEnd);
  if (input.scheduledStart.trim() && !start) return "Jadwal mulai tidak valid.";
  if (input.scheduledEnd.trim() && !end) return "Jadwal selesai tidak valid.";
  if (start && end && end < start) return "Jadwal selesai tidak boleh sebelum jadwal mulai.";
  return null;
}

export function deviceIdentifierFromItem(item: {
  purchaseOrderItem?: {
    deviceId?: string | null;
    device?: { serialNumber?: string | null; brand?: string | null; model?: string | null } | null;
    quotationItem?: {
      requestItem?: { deviceId?: string | null; deviceType?: { name?: string | null } | null } | null;
    } | null;
  } | null;
}): { identifier: string | null; deviceTypeName: string | null } {
  const requestItem = item.purchaseOrderItem?.quotationItem?.requestItem;
  const device = item.purchaseOrderItem?.device;
  const identifier =
    requestItem?.deviceId?.trim() ||
    device?.serialNumber?.trim() ||
    item.purchaseOrderItem?.deviceId?.trim() ||
    null;
  const deviceTypeName = requestItem?.deviceType?.name?.trim() || null;
  return { identifier, deviceTypeName };
}

export function formatWorkOrderApiError(
  err: unknown,
  fallback: string,
): { message: string; workOrderId?: string } {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    const workOrderId =
      typeof err.data?.workOrderId === "string" ? err.data.workOrderId : undefined;
    const messages: Record<string, string> = {
      DUPLICATE_ACTIVE_WORK_ORDER:
        "Purchase Order ini sudah memiliki Work Order aktif. Batalkan Work Order tersebut terlebih dahulu, atau buka Work Order yang sudah ada.",
      INVALID_STATUS_FOR_WORK_ORDER:
        "Hanya Purchase Order APPROVED yang dapat dibuatkan Work Order.",
      PURCHASE_ORDER_NOT_FOUND: "Purchase Order tidak ditemukan.",
      PURCHASE_ORDER_HAS_NO_ITEMS: "Purchase Order tidak memiliki item.",
      CALIBRATION_REQUEST_NOT_FOUND: "Requisition sumber tidak ditemukan.",
      WORK_ORDER_NOT_FOUND: "Work Order tidak ditemukan.",
      INVALID_STATUS_TRANSITION: "Transisi status Work Order tidak diizinkan.",
      INVALID_STATUS_FOR_UPDATE: "Work Order terminal tidak dapat diedit.",
      ALREADY_CANCELLED: "Work Order sudah dibatalkan.",
      INVALID_WORK_ORDER_ASSIGNEE: "Teknisi harus anggota aktif company ini.",
      INVALID_WORK_ORDER: "Data Work Order tidak valid.",
      INVALID_WORK_ORDER_UPDATE: "Data update Work Order tidak valid.",
      INVALID_WORK_ORDER_ASSIGN: "Data assignment Work Order tidak valid.",
    };
    if (code && messages[code]) {
      return { message: messages[code], workOrderId };
    }
    if (typeof err.data?.message === "string") {
      return { message: err.data.message, workOrderId };
    }
    return { message: err.message, workOrderId };
  }
  return { message: fallback };
}
