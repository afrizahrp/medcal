"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  JobReferenceEquipmentReplaceItem,
  TechReferenceEquipmentCandidate,
  TechReferenceEquipmentUsed,
} from "../../../lib/calibration/reference-equipment";

/**
 * Split out of use-job-query.ts to keep that file focused on the identity flow.
 * Query keys sit under ["job", id, …] so the job-detail page's broad
 * invalidations (["job", id]) sweep these too.
 */

const candidatesKey = (id: string) => ["job", id, "reference-equipment-candidates"] as const;
const usedKey = (id: string) => ["job", id, "reference-equipment-used"] as const;

export function useReferenceEquipmentCandidates(id: string) {
  return useQuery({
    queryKey: candidatesKey(id),
    queryFn: () =>
      apiFetch<TechReferenceEquipmentCandidate[]>(
        `/calibration-jobs/${id}/reference-equipment-candidates`,
      ),
    enabled: Boolean(id),
  });
}

export function useReferenceEquipmentUsed(id: string) {
  return useQuery({
    queryKey: usedKey(id),
    queryFn: () =>
      apiFetch<TechReferenceEquipmentUsed[]>(`/calibration-jobs/${id}/reference-equipment-used`),
    enabled: Boolean(id),
  });
}

/** Full-set replace — submits the complete list of units used, every time. */
export function useReplaceReferenceEquipmentUsed(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: JobReferenceEquipmentReplaceItem[]) =>
      apiFetch<TechReferenceEquipmentUsed[]>(`/calibration-jobs/${id}/reference-equipment-used`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    },
  });
}
