"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { TechCalibrationJob, TechIdentityCorrection } from "../../../lib/calibration/types";

export interface EscalateIdentityInput {
  technicianObservedAkdAkl?: string;
  reason?: string;
}

const jobKey = (id: string) => ["job", id] as const;
const correctionsKey = (id: string) => ["job", id, "corrections"] as const;

export function useJobQuery(id: string) {
  return useQuery({
    queryKey: jobKey(id),
    queryFn: () => apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}`),
    enabled: Boolean(id),
  });
}

export function useCorrectionsQuery(id: string) {
  return useQuery({
    queryKey: correctionsKey(id),
    queryFn: () => apiFetch<TechIdentityCorrection[]>(`/calibration-jobs/${id}/identity-corrections`),
    enabled: Boolean(id),
  });
}

export function useCorrectionQuery(jobId: string, correctionId: string) {
  const corrections = useCorrectionsQuery(jobId);
  const correction = corrections.data?.find((c) => c.id === correctionId) ?? null;
  return { ...corrections, correction };
}

export function useEscalateIdentity(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EscalateIdentityInput) =>
      apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}/escalate-identity`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: jobKey(id) });
      queryClient.invalidateQueries({ queryKey: correctionsKey(id) });
    },
  });
}
