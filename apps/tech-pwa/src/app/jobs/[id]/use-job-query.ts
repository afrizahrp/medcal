"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@medcal/shared";
import type {
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

/**
 * Opt-in live refresh — poll every 6s + refetch on focus, mirroring
 * apps/portal's list/detail hooks (use-calibration-jobs-query.ts,
 * use-identity-corrections-query.ts). Opt-in because the Identity Correction
 * wizard reuses useJobQuery in its layout and must NOT poll while the
 * technician is filling signatures/photos. refetchIntervalInBackground is left
 * at its default (false) so polling pauses while the PWA is backgrounded.
 */
export interface LiveQueryOptions {
  poll?: boolean;
}
const LIVE_REFRESH = { refetchInterval: 6000, refetchOnWindowFocus: true } as const;

export function useJobQuery(id: string, options?: LiveQueryOptions) {
  return useQuery({
    queryKey: jobKey(id),
    queryFn: () => apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}`),
    enabled: Boolean(id),
    ...(options?.poll ? LIVE_REFRESH : {}),
  });
}

export function useCorrectionsQuery(id: string, options?: LiveQueryOptions) {
  return useQuery({
    queryKey: correctionsKey(id),
    queryFn: () => apiFetch<TechIdentityCorrection[]>(`/calibration-jobs/${id}/identity-corrections`),
    enabled: Boolean(id),
    ...(options?.poll ? LIVE_REFRESH : {}),
  });
}

export function useCorrectionQuery(
  jobId: string,
  correctionId: string,
  options?: LiveQueryOptions,
) {
  const corrections = useCorrectionsQuery(jobId, options);
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

/**
 * "Mulai Kalibrasi" — POST /calibration-jobs/:id/start. Moves the job
 * PENDING → IN_PROGRESS + stamps startedAt, unlocking reference-equipment
 * recording. Invalidates the job + list queries so the detail screen and the
 * reference-equipment screen re-evaluate their "Job belum dimulai" gates.
 */
export function useStartCalibration(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}/start`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: jobKey(id) });
    },
  });
}

/** Technician submitForReview — POST /calibration-jobs/:id/submit. */
export function useSubmitForReview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: jobKey(id) });
    },
  });
}

/** Technician complete — POST /calibration-jobs/:id/complete. */
export function useCompleteJob(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}/complete`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: jobKey(id) });
    },
  });
}

/** Technician resumeAfterRework — POST /calibration-jobs/:id/resume. */
export function useResumeAfterRework(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TechCalibrationJob>(`/calibration-jobs/${id}/resume`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: jobKey(id) });
    },
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
