import {
  MASTER_CODE_CONFIG,
  resolveMasterCodeConfig,
  type MasterCodeEntity,
} from "./master-code-config";

/**
 * Formats an allocated sequence value into a business code, e.g.
 * `formatMasterCode("DVC", 42, 6)` → `"DVC-000042"`.
 */
export function formatMasterCode(prefix: string, sequence: number, width: number): string {
  if (!/^[A-Z]{2,6}$/.test(prefix)) {
    throw new Error(`Invalid master code prefix: ${prefix}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid master code sequence: ${sequence}`);
  }
  return `${prefix}-${String(sequence).padStart(width, "0")}`;
}

/** Regex matching a system-generated code for `entity` (e.g. `/^DVC-\d+$/`). */
export function masterCodePattern(entity: MasterCodeEntity): RegExp {
  return new RegExp(`^${resolveMasterCodeConfig(entity).prefix}-\\d+$`);
}

/**
 * True when `value` is a system-generated code for `entity`. Legacy hand-entered
 * / slug codes (e.g. `ESA-001`, `DIGITAL_MULTIMETER`) return false — they are
 * deliberately ignored by the sequence bootstrap.
 */
export function isGeneratedMasterCode(entity: MasterCodeEntity, value: string): boolean {
  return masterCodePattern(entity).test(value);
}

/** Every prefix this module owns — for collision checks / display. */
export const MASTER_CODE_PREFIXES = Object.fromEntries(
  Object.entries(MASTER_CODE_CONFIG).map(([entity, config]) => [entity, config.prefix]),
) as Record<MasterCodeEntity, string>;
