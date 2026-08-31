/**
 * Master Identity & Coding Standard — configuration.
 *
 * Single source of truth for every Device Management master that receives an
 * automatically generated, human-readable business `code`. The technical
 * identity (CUID `id`) is unchanged; this only governs the separate `code`
 * column.
 *
 * Phase 1 wired `DEVICE` and `EQUIPMENT` (per-company physical units). Phase 2
 * adds the global taxonomy masters. All Phase 2 entities already have a `code`
 * column (unique or composite-unique); existing slug values (`DIGITAL_MULTIMETER`)
 * are left untouched and coexist with new `PREFIX-NNN` values — the bootstrap
 * regex ignores anything that is not `^PREFIX-\d+$`.
 */

export type MasterCodeEntity =
  | "DEVICE"
  | "EQUIPMENT"
  | "DEVICE_CATEGORY"
  | "DEVICE_TYPE"
  | "DEVICE_CAPABILITY"
  | "DEVICE_CALIBRATION_PARAMETER"
  | "EQUIPMENT_TYPE";

export interface MasterCodeConfig {
  /** Fixed 3–5 uppercase-letter prefix. Must not collide with DOCUMENT_TYPE_PREFIX. */
  prefix: string;
  /** Zero-padded width of the numeric segment, e.g. 6 → `DVC-000001`. */
  width: number;
  /**
   * `company` → one counter per company, code unique per (companyId, code).
   * `global`  → one counter for the whole deployment, code globally unique.
   */
  scope: "global" | "company";
  /** Prisma model's table name — used to bootstrap the counter from existing rows. */
  table: string;
}

export const MASTER_CODE_CONFIG: Record<MasterCodeEntity, MasterCodeConfig> = {
  DEVICE: { prefix: "DVC", width: 6, scope: "company", table: "Device" },
  EQUIPMENT: { prefix: "EQU", width: 6, scope: "company", table: "Equipment" },
  DEVICE_CATEGORY: { prefix: "DVCAT", width: 3, scope: "global", table: "DeviceCategory" },
  DEVICE_TYPE: { prefix: "DVTP", width: 3, scope: "global", table: "DeviceType" },
  DEVICE_CAPABILITY: { prefix: "DVCAP", width: 3, scope: "global", table: "DeviceCapability" },
  DEVICE_CALIBRATION_PARAMETER: {
    prefix: "DCP",
    width: 4,
    scope: "global",
    table: "DeviceCalibrationParameter",
  },
  EQUIPMENT_TYPE: { prefix: "EQTP", width: 3, scope: "global", table: "EquipmentType" },
};

export function resolveMasterCodeConfig(entity: MasterCodeEntity): MasterCodeConfig {
  const config = MASTER_CODE_CONFIG[entity];
  if (!config) {
    throw new Error(`Unsupported master code entity: ${entity}`);
  }
  return config;
}
