"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { TechDeviceCandidateListResponse } from "../../../lib/calibration/device-lookup";
import type { TechCalibrationJob } from "../../../lib/calibration/types";

/**
 * Technician Device Lookup (2026-09-21) — split out like
 * use-reference-equipment-query.ts, keeping use-job-query.ts focused on the
 * identity flow. Query key sits under ["job", id, …] so the job-detail page's
 * broad ["job", id] invalidation sweeps this too.
 */

const candidatesKey = (id: string, search: string) =>
  ["job", id, "device-candidates", search] as const;

export function useDeviceCandidates(id: string, search: string) {
  return useQuery({
    queryKey: candidatesKey(id, search),
    queryFn: () =>
      apiFetch<TechDeviceCandidateListResponse>(
        `/calibration-jobs/${id}/device-candidates${
          search ? `?search=${encodeURIComponent(search)}` : ""
        }`,
      ),
    enabled: Boolean(id),
  });
}

export function useSelectDevice(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}/select-device`, {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    },
  });
}
