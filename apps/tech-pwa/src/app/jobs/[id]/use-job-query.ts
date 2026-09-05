"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@medcal/shared";
import type {
  CalibrationJobDeviceCandidate,
  IdentityCorrectionSubmitInput,
  IdentityCorrectionSubmitResult,
  TechCalibrationJob,
  TechIdentityCorrection,
} from "../../../lib/calibration/types";

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

export function useDeviceCandidates(jobId: string | undefined, search: string, enabled: boolean) {
  const trimmed = search.trim();
  return useQuery({
    queryKey: ["job", jobId, "device-candidates", trimmed],
    queryFn: () =>
      apiFetch<CalibrationJobDeviceCandidate[]>(
        `/calibration-jobs/${jobId}/device-candidates${
          trimmed ? `?search=${encodeURIComponent(trimmed)}` : ""
        }`,
      ),
    enabled: Boolean(jobId) && enabled,
  });
}

export function useSubmitIdentityCorrection(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IdentityCorrectionSubmitInput) =>
      apiFetch<IdentityCorrectionSubmitResult>(`/calibration-jobs/${id}/identity-corrections`, {
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

/**
 * BA sheet photo upload goes through the generic FilesModule. Raw fetch (not
 * apiFetch) because the body is multipart/form-data — the browser sets the
 * boundary. One photo per correction (both signatures live on the same
 * physical sheet) — ownerId is the correction id, not either signature's id.
 */
export function useUploadIdentityCorrectionPhoto(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ correctionId, file }: { correctionId: string; file: File }) => {
      const form = new FormData();
      form.append("ownerType", "IDENTITY_CORRECTION");
      form.append("ownerId", correctionId);
      form.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        let data: ({ code?: string; message?: string } & Record<string, unknown>) | undefined;
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = undefined;
        }
        throw new ApiError(res.status, data?.message ?? res.statusText, data);
      }
      return (await res.json()) as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: correctionsKey(id) });
    },
  });
}
