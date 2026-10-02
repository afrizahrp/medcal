import { ApiError } from "@medcal/shared";
import type { WorkOrderAssignInput, WorkOrderCreateBody, WorkOrderUpdateBody } from "@medcal/shared";
import { deviceDisplayNames } from "../../../lib/device-name-display";

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

/**
 * Allocation & Multi-WOL Architecture (Phase 8 — PO Detail multi-WorkOrder
 * view). The legacy single-WorkOrder creation flow (/work-orders/new) still
 * gates on "no active WorkOrder exists yet" for this PO — redesigning that
 * form is out of Phase 8's scope. PO Detail must therefore only ever offer
 * that shortcut when following it would not dead-end: i.e. when none of the
 * PO's current WorkOrders is active (non-cancelled). This is independent of
 * the Plan WOL/SPK entry point, which remains available regardless.
 */
export function canOfferLegacyWorkOrderShortcut<T extends { status: string }>(
  rows: T[],
): boolean {
  return !findActiveWorkOrder(rows);
}

/**
 * Shared ON_SITE SPK: groups a PO's Work Order rows for display. Child SPKs
 * (those with a Parent) are gathered under their Parent in first-appearance
 * order; single/flat SPK and WOL rows stay standalone. The Parent is NOT a Work
 * Order — it is a non-executable container shown only as a group header.
 */
export type WorkOrderRowGroup<T> =
  | { kind: "single"; row: T }
  | {
      kind: "parent";
      parentSpkId: string;
      parentSpkNumber: string;
      children: T[];
    };

export function groupWorkOrdersByParent<
  T extends { parentSpkId?: string | null; parentSpkNumber?: string | null; childSequence?: number | null },
>(rows: T[]): WorkOrderRowGroup<T>[] {
  const groups: WorkOrderRowGroup<T>[] = [];
  const parents = new Map<string, Extract<WorkOrderRowGroup<T>, { kind: "parent" }>>();
  for (const row of rows) {
    if (!row.parentSpkId) {
      groups.push({ kind: "single", row });
      continue;
    }
    let group = parents.get(row.parentSpkId);
    if (!group) {
      group = {
        kind: "parent",
        parentSpkId: row.parentSpkId,
        parentSpkNumber: row.parentSpkNumber ?? row.parentSpkId,
        children: [],
      };
      parents.set(row.parentSpkId, group);
      groups.push(group);
    }
    group.children.push(row);
  }
  for (const group of parents.values()) {
    group.children.sort((a, b) => (a.childSequence ?? 0) - (b.childSequence ?? 0));
  }
  return groups;
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
  /**
   * MOM #1 — Transaction Revision + Immutable History. Matches the MOM's
   * explicit WorkOrder boundary and REVISABLE_WORK_ORDER_STATUSES in
   * work-orders.service.ts: PLANNED/ASSIGNED only — IN_PROGRESS locks scope
   * (CalibrationJob fan-out can run), DONE/CANCELLED are terminal.
   */
  canRevise: boolean;
} {
  if (status === "PLANNED") {
    return {
      canEdit: true,
      canAssign: true,
      canStart: false,
      canDone: false,
      canCancel: true,
      isLocked: false,
      canRevise: true,
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
      canRevise: true,
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
      canRevise: false,
    };
  }
  return {
    canEdit: false,
    canAssign: false,
    canStart: false,
    canDone: false,
    canCancel: false,
    isLocked: true,
    canRevise: false,
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

/**
 * WorkOrder schedule fields (`scheduledStart`/`scheduledEnd`) are date-only in
 * business meaning — see the migration report. On reload, an API instant string
 * (`2026-09-01T00:00:00.000Z`) becomes the `YYYY-MM-DD` the form and the shared
 * DateField use; any time-of-day on legacy rows is dropped.
 */
export function toScheduleDateValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** `YYYY-MM-DD` form value → the `YYYY-MM-DD` wire string (`null` when empty). */
export function fromScheduleDateValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildWorkOrderCreatePayload(input: {
  purchaseOrderId: string;
  addressText: string;
  geoLat: string;
  geoLng: string;
  locationNotes: string;
  scheduledStart: string;
  scheduledEnd: string;
}): WorkOrderCreateBody {
  return {
    purchaseOrderId: input.purchaseOrderId,
    addressText: emptyToNull(input.addressText),
    geoLat: parseOptionalCoord(input.geoLat),
    geoLng: parseOptionalCoord(input.geoLng),
    locationNotes: emptyToNull(input.locationNotes),
    scheduledStart: fromScheduleDateValue(input.scheduledStart),
    scheduledEnd: fromScheduleDateValue(input.scheduledEnd),
  };
}

export function buildWorkOrderUpdatePayload(input: {
  addressText: string;
  geoLat: string;
  geoLng: string;
  locationNotes: string;
  scheduledStart: string;
  scheduledEnd: string;
}): WorkOrderUpdateBody {
  // serviceMode is immutable after create (it determines SPK vs WOL) — not sent.
  return {
    addressText: emptyToNull(input.addressText),
    geoLat: parseOptionalCoord(input.geoLat),
    geoLng: parseOptionalCoord(input.geoLng),
    locationNotes: emptyToNull(input.locationNotes),
    scheduledStart: fromScheduleDateValue(input.scheduledStart),
    scheduledEnd: fromScheduleDateValue(input.scheduledEnd),
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
  // Date-only `YYYY-MM-DD` strings compare lexicographically.
  const start = fromScheduleDateValue(input.scheduledStart);
  const end = fromScheduleDateValue(input.scheduledEnd);
  if (start && end && end < start) return "Jadwal selesai tidak boleh sebelum jadwal mulai.";
  return null;
}

export function deviceIdentifierFromItem(item: {
  purchaseOrderItem?: {
    deviceId?: string | null;
    device?: { serialNumber?: string | null; brand?: string | null; model?: string | null } | null;
    quotationItem?: {
      requestItem?: {
        deviceId?: string | null;
        customerDeviceName?: string | null;
        deviceType?: { name?: string | null } | null;
      } | null;
    } | null;
  } | null;
}): { identifier: string | null; deviceName: string | null; deviceTypeName: string | null } {
  const requestItem = item.purchaseOrderItem?.quotationItem?.requestItem;
  const device = item.purchaseOrderItem?.device;
  const identifier =
    requestItem?.deviceId?.trim() ||
    device?.serialNumber?.trim() ||
    item.purchaseOrderItem?.deviceId?.trim() ||
    null;
  // Alias on top, master name below (MoM #3).
  const names = deviceDisplayNames({
    customerDeviceName: requestItem?.customerDeviceName,
    deviceTypeName: requestItem?.deviceType?.name,
  });
  return { identifier, deviceName: names.primary, deviceTypeName: names.secondary };
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
      // MOM #1 — Transaction Revision + Immutable History
      INVALID_STATUS_FOR_REVISE: "Work Order tidak dalam status yang bisa direvisi.",
      NO_PENDING_SCOPE_CHANGE:
        "Tidak ada perubahan scope dari Purchase Order untuk diterapkan ke Work Order ini.",
      // Shared ON_SITE SPK (Parent / Child)
      SHARED_SPK_ON_SITE_ONLY: "Bagikan Pekerjaan hanya tersedia untuk Purchase Order ON_SITE.",
      INVALID_SHARED_SPK: "Data pembagian pekerjaan tidak valid.",
      OVER_ALLOCATION:
        "Jumlah unit yang dibagikan melebihi sisa unit pada Purchase Order. Muat ulang halaman lalu bagikan kembali.",
      PURCHASE_ORDER_ITEM_NOT_ACTIVE: "Item Purchase Order tidak aktif atau tidak ditemukan.",
      DUPLICATE_ALLOCATION_ITEM: "Item yang sama dibagikan lebih dari sekali pada satu SPK Child.",
      SHARED_CHILD_LOCKED: "SPK Child sudah dimulai dan terkunci untuk revisi.",
      SHARED_CHILD_SCHEDULE_LOCKED: "Jadwal SPK Child yang sudah dimulai tidak dapat diubah.",
      SHARED_CHILD_NOT_FOUND: "SPK Child bukan bagian dari SPK bersama ini.",
      SHARED_SPK_NO_ACTIVE_CHILD: "SPK bersama harus memiliki minimal satu SPK Child aktif.",
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
