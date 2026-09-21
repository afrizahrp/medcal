/**
 * Technician Device Lookup (2026-09-21) — local mirrors of the apps/api
 * DeviceListResult shape, trimmed to what the tech-pwa candidate list needs.
 * Deliberately does not include the internal `code`/`id` for display purposes:
 * per the MoM decision, the technician matches by brand/model/type + Serial
 * No only, never an internal identifier.
 */

export interface TechDeviceCandidate {
  id: string;
  code: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  deviceType: { id: string; code: string; name: string } | null;
}

export interface TechDeviceCandidateListResponse {
  data: TechDeviceCandidate[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
