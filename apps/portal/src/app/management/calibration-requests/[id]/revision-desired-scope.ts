import type { CalibrationRequestImportPreviewRow } from "@medcal/shared";
import type {
  CalibrationRequestItem,
  AkdAklDeclarationValue,
  DeviceTypeOption,
} from "../calibration-requests-ui";

/**
 * MOM #1 — Final Revision Scope Design §12/§19: the Revise editor represents
 * the COMPLETE DESIRED SCOPE, not a quantity-only form. One local row per
 * current item (editable, or marked "removed" while staying visible) plus
 * any newly added rows. "Change Device" is one user action that is
 * persisted as REMOVE (old id) + ADD (new, no id) — never a special
 * replacement mechanism, and the new row never carries the old row's id.
 *
 * Kept in a plain `.ts` file (no JSX) so `buildImportedDesiredRows` below can
 * be unit-tested directly — this repo's portal Vitest config cannot import
 * from `.tsx` files that contain JSX.
 */
export interface DesiredItemRow {
  key: string;
  id?: string;
  deviceTypeId: string;
  customerDeviceName: string;
  model: string;
  deviceId: string;
  qty: number;
  akdAkl: string;
  akdAklDeclaration: AkdAklDeclarationValue;
  notes: string;
  removed: boolean;
}

export function rowFromItem(item: CalibrationRequestItem): DesiredItemRow {
  return {
    key: item.id,
    id: item.id,
    deviceTypeId: item.deviceTypeId,
    customerDeviceName: item.customerDeviceName ?? "",
    model: item.model ?? "",
    deviceId: item.deviceId ?? "",
    qty: item.qty,
    akdAkl: item.akdAkl ?? "",
    akdAklDeclaration: item.akdAklDeclaration,
    notes: item.notes ?? "",
    removed: false,
  };
}

/**
 * MOM #1 — Import Excel for Requisition Revision. Pure mapping step between
 * the existing `/calibration-requests/import/preview` response and the
 * Revise dialog's desired-scope rows.
 *
 * Identity rule: a preview row whose resolved deviceTypeId matches a
 * deviceTypeId still on `currentItems` (and not already claimed by an
 * earlier row in the same file) retains that item's id, so the existing
 * revision engine treats it as update-in-place. Every other resolved row
 * becomes a new desired-scope entry with no id. Any currentItems left
 * unclaimed become Removed rows, exactly like the manual "X" button.
 *
 * Also returns `resolvedDeviceTypes`: the existing matcher's own
 * `match.deviceTypeName`/`match.deviceTypeCode` for every row it resolved
 * (exact-name or alias — the same lookup the matcher already performed, not
 * a second one), so the caller can seed the manual "Add Device"
 * `DeviceTypeItemSelect`'s options with any device type an ADDED row
 * resolved to but that isn't already on `request.items` or yet loaded by
 * the device-types list query. Without this, the selector has no option to
 * match `deviceTypeId` against and renders blank even though identity was
 * resolved correctly.
 */
export function buildImportedDesiredRows(
  currentItems: CalibrationRequestItem[],
  previewRows: CalibrationRequestImportPreviewRow[],
  makeKey: () => string = () => `new-${Math.random().toString(36).slice(2)}`,
): { rows: DesiredItemRow[]; resolvedDeviceTypes: DeviceTypeOption[] } | { errors: string[] } {
  const errors: string[] = [];
  const consumed = new Set<string>();
  const importedRows: DesiredItemRow[] = [];
  const resolvedDeviceTypes = new Map<string, DeviceTypeOption>();
  for (const row of previewRows) {
    if (row.errors.length > 0) {
      errors.push(`Baris ${row.rowNumber}: ${row.errors.join(", ")}`);
      continue;
    }
    const deviceTypeId = row.match.deviceTypeId;
    if (!deviceTypeId) {
      errors.push(
        `Baris ${row.rowNumber}: Device Name "${row.customerDeviceName}" tidak dapat dipetakan ke Device Type. Perbaiki nama di Excel.`,
      );
      continue;
    }
    if (!resolvedDeviceTypes.has(deviceTypeId)) {
      resolvedDeviceTypes.set(deviceTypeId, {
        id: deviceTypeId,
        name: row.match.deviceTypeName ?? row.customerDeviceName,
        code: row.match.deviceTypeCode ?? undefined,
      });
    }
    const original = !consumed.has(deviceTypeId)
      ? currentItems.find((item) => item.deviceTypeId === deviceTypeId)
      : undefined;
    if (original) {
      consumed.add(deviceTypeId);
      importedRows.push({
        ...rowFromItem(original),
        customerDeviceName: row.customerDeviceName || original.customerDeviceName || "",
        model: row.model || original.model || "",
        deviceId: row.deviceId || original.deviceId || "",
        qty: row.qty ?? 1,
        akdAkl: row.akdAkl || original.akdAkl || "",
      });
    } else {
      importedRows.push({
        key: makeKey(),
        deviceTypeId,
        customerDeviceName: row.customerDeviceName,
        model: row.model ?? "",
        deviceId: row.deviceId ?? "",
        qty: row.qty ?? 1,
        akdAkl: row.akdAkl ?? "",
        akdAklDeclaration: "NOT_PROVIDED",
        notes: "",
        removed: false,
      });
    }
  }
  if (errors.length > 0) return { errors };
  const removedRows = currentItems
    .filter((item) => !consumed.has(item.deviceTypeId))
    .map((item) => ({ ...rowFromItem(item), removed: true }));
  return {
    rows: [...importedRows, ...removedRows],
    resolvedDeviceTypes: [...resolvedDeviceTypes.values()],
  };
}
