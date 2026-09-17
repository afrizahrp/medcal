/**
 * Display order for a device's two names (MoM #3, decided 2026-09-14):
 * the customer-given alias (`CalibrationRequestItem.customerDeviceName`) reads
 * on top, the MEDCAL master name (`DeviceType.name`) underneath it as the
 * secondary line.
 *
 * When no alias exists the master name takes the primary line on its own —
 * callers must never render `secondary` when it is null, so a missing alias
 * leaves no empty line behind.
 */
export interface DeviceDisplayNames {
  /** Alias when present, otherwise the master name (or the caller's fallback). */
  primary: string | null;
  /** Master name, only when it is not already the primary line. */
  secondary: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function deviceDisplayNames(input: {
  /** Customer's own wording for the device — the alias. */
  customerDeviceName?: string | null;
  /** MEDCAL master name from DeviceType. */
  deviceTypeName?: string | null;
  /** Last resort when neither name is available (e.g. a free-text line description). */
  fallback?: string | null;
}): DeviceDisplayNames {
  const alias = clean(input.customerDeviceName);
  const master = clean(input.deviceTypeName);
  if (!alias) return { primary: master ?? clean(input.fallback), secondary: null };
  return { primary: alias, secondary: master && master !== alias ? master : null };
}
