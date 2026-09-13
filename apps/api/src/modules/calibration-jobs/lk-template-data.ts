/**
 * Presentation-only payload for template-aware LK rendering.
 * Template rows come from the .docx definition; these fields only fill cells.
 */

export interface LkIdentityFill {
  certificateNumber: string;
  deviceName: string;
  assetNumber: string;
  brand: string;
  owner: string;
  model: string;
  room: string;
  serial: string;
  receivedDate: string;
  calibrationDate: string;
  capacity: string;
  resolution: string;
}

export interface LkEquipmentFill {
  name: string;
  brand: string;
  model: string;
  serialNumber: string;
}

export interface LkPhysicalFill {
  name: string;
  inspectionLimit: string;
  verdict: "BAIK" | "TIDAK_BAIK" | null;
}

export interface LkMeasurementHit {
  parameterCode: string;
  settingLabel: string;
  settingValue: number | null;
  replicateIndex: number;
  formattedValue: string;
}

export interface LkTemplateData {
  identity: LkIdentityFill;
  equipmentUsed: LkEquipmentFill[];
  physicalItems: LkPhysicalFill[];
  measurements: LkMeasurementHit[];
  technicianName: string;
  dataEntryName: string;
}

export function normalizeLkKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function settingMatches(hit: LkMeasurementHit, setting: number): boolean {
  if (hit.settingValue != null && Number(hit.settingValue) === setting) return true;
  const label = hit.settingLabel.replace(",", ".");
  const match = label.match(/-?\d+(?:\.\d+)?/);
  return match != null && Number(match[0]) === setting;
}

export function replicatesFor(
  measurements: LkMeasurementHit[],
  parameterCodes: readonly string[],
  setting: number,
  count: number,
): string[] {
  const codes = new Set(parameterCodes);
  const hits = measurements
    .filter((m) => codes.has(m.parameterCode) && settingMatches(m, setting))
    .sort((a, b) => a.replicateIndex - b.replicateIndex);
  return Array.from({ length: count }, (_, i) => {
    const found = hits.find((h) => h.replicateIndex === i + 1) ?? hits[i];
    return found?.formattedValue ?? "";
  });
}
