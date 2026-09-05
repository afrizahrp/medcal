"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import { CALIBRATION_JOBS_QUERY_KEY } from "./use-calibration-jobs-query";

// ── Types (mirror JobReferenceEquipmentUsedDetail from job-reference-equipment.ts) ──

export interface ReferenceEquipmentUsedEquipment {
  id: string;
  code: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  equipmentType: { id: string; code: string; name: string };
}

export interface ReferenceEquipmentUsedRecord {
  id: string;
  calibrationDate: string;
  validFrom: string | null;
  validUntil: string;
  certificateNumber: string | null;
}

export interface ReferenceEquipmentUsedOverrider {
  id: string;
  name: string | null;
}

export interface ReferenceEquipmentUsed {
  id: string;
  companyId: string;
  calibrationJobId: string;
  equipmentId: string;
  equipmentCalibrationRecordId: string | null;
  notes: string | null;
  validityOverridden: boolean;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  overriddenAt: string | null;
  createdAt: string;
  updatedAt: string;
  equipment: ReferenceEquipmentUsedEquipment;
  equipmentCalibrationRecord: ReferenceEquipmentUsedRecord | null;
  overriddenBy: ReferenceEquipmentUsedOverrider | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Read-only. Recording reference equipment is a technician-actor capability
 * (tech-pwa) — Portal never writes here, so there are no mutation hooks.
 * The query-key prefix reuses CALIBRATION_JOBS_QUERY_KEY so the job detail
 * page's existing invalidations sweep this too.
 */
export function useReferenceEquipmentUsed(jobId: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId ?? "", "reference-equipment-used"] as const,
    queryFn: () =>
      apiFetch<ReferenceEquipmentUsed[]>(
        `/calibration-jobs/${jobId}/reference-equipment-used`,
      ),
    enabled: Boolean(jobId),
  });
}
