"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { JobReferenceEquipmentReplaceInput } from "@medcal/shared";
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

// ── Candidate types (mirror JobReferenceEquipmentCandidate from job-reference-equipment.ts) ──

export type JobEquipmentValidityStatus =
  "VALID" | "EXPIRED" | "NOT_YET_VALID" | "NO_RECORD" | "NOT_ACCEPTED_FOR_USE";

export interface ReferenceEquipmentCandidateValidity {
  status: JobEquipmentValidityStatus;
  recordId: string | null;
  validUntil: string | null;
}

export interface ReferenceEquipmentCandidate {
  equipmentId: string;
  code: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  equipmentTypeId: string;
  equipmentTypeName: string;
  isActive: boolean;
  validity: ReferenceEquipmentCandidateValidity;
  requiredForDeviceType: boolean;
}

/** One item of the full-set PUT body. `override` is TECHNICIAN_MANAGER-only. */
export type JobReferenceEquipmentReplaceItem = JobReferenceEquipmentReplaceInput["items"][number];

// ── Hooks ─────────────────────────────────────────────────────────────────────

const usedKey = (jobId: string) =>
  [CALIBRATION_JOBS_QUERY_KEY, jobId, "reference-equipment-used"] as const;
const candidatesKey = (jobId: string) =>
  [CALIBRATION_JOBS_QUERY_KEY, jobId, "reference-equipment-candidates"] as const;

/**
 * Recording reference equipment is a technician-actor capability first built for
 * tech-pwa. Portal now also exposes it on the job detail page for
 * TECHNICIAN_MANAGER, who reviews/overrides from a desk — this is a thin client
 * over the exact same API contract (candidates + full-set-replace), not a
 * parallel implementation of the validity/lock rules.
 * The query-key prefix reuses CALIBRATION_JOBS_QUERY_KEY so the job detail
 * page's existing invalidations sweep this too.
 */
export function useReferenceEquipmentUsed(jobId: string | undefined) {
  return useQuery({
    queryKey: usedKey(jobId ?? ""),
    queryFn: () =>
      apiFetch<ReferenceEquipmentUsed[]>(`/calibration-jobs/${jobId}/reference-equipment-used`),
    enabled: Boolean(jobId),
    // Refetch on focus so a reviewer coming back to the tab sees a field
    // recording, but no interval poll — it would clobber an in-progress
    // override-reason edit in the section's editor.
    refetchOnWindowFocus: true,
  });
}

export function useReferenceEquipmentCandidates(jobId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: candidatesKey(jobId ?? ""),
    queryFn: () =>
      apiFetch<ReferenceEquipmentCandidate[]>(
        `/calibration-jobs/${jobId}/reference-equipment-candidates`,
      ),
    enabled: Boolean(jobId) && enabled,
  });
}

/** Full-set replace — submits the complete list of units used, every time. */
export function useReplaceReferenceEquipmentUsed(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: JobReferenceEquipmentReplaceItem[]) =>
      apiFetch<ReferenceEquipmentUsed[]>(`/calibration-jobs/${jobId}/reference-equipment-used`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId] });
    },
  });
}
