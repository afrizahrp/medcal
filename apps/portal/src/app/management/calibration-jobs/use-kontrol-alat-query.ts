"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  KontrolAlatPatchInput,
  KontrolAlatAccessoryCreateInput,
  KontrolAlatAccessoryUpdateInput,
  KontrolAlatSignatureCreateInput,
} from "@medcal/shared";
import { CALIBRATION_JOBS_QUERY_KEY } from "./use-calibration-jobs-query";

// ── Local types ────────────────────────────────────────────────────────────────

export type PortalKontrolAlatSignerKind = "ADMINISTRATION" | "TECHNICAL_OFFICER";

export interface PortalKontrolAlatAccessory {
  id: string;
  kontrolAlatId: string;
  label: string;
  sortOrder: number;
  present: boolean | null;
  sourceWorkOrderItemAccessoryId: string | null;
}

export interface PortalKontrolAlatSignature {
  id: string;
  kontrolAlatId: string;
  signerKind: PortalKontrolAlatSignerKind;
  signerUserId: string | null;
  signerName: string;
  signedAt: string | null;
}

export interface PortalKontrolAlat {
  id: string;
  calibrationJobId: string;
  workExecuted: boolean | null;
  notExecutedReason: string | null;
  capacity: string | null;
  visualPowerCable: boolean | null;
  visualDisplay: boolean | null;
  visualButtons: boolean | null;
  functionInitialOk: boolean | null;
  functionFinalOk: boolean | null;
  certificateNumber: string | null;
  completedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  accessories: PortalKontrolAlatAccessory[];
  signatures: PortalKontrolAlatSignature[];
  createdBy: { id: string; name: string | null } | null;
}

// ── Keys ───────────────────────────────────────────────────────────────────────

const kaKey = (jobId: string) => [CALIBRATION_JOBS_QUERY_KEY, jobId, "kontrol-alat"] as const;

// ── Queries ────────────────────────────────────────────────────────────────────

export function usePortalKontrolAlat(jobId: string) {
  return useQuery({
    queryKey: kaKey(jobId),
    queryFn: () => apiFetch<PortalKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat`),
    enabled: Boolean(jobId),
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export function usePatchPortalKontrolAlat(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: KontrolAlatPatchInput) =>
      apiFetch<PortalKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId] });
    },
  });
}

export function useAddPortalKontrolAlatAccessory(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: KontrolAlatAccessoryCreateInput) =>
      apiFetch<PortalKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat/accessories`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
    },
  });
}

export function useUpdatePortalKontrolAlatAccessory(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accessoryId,
      input,
    }: {
      accessoryId: string;
      input: KontrolAlatAccessoryUpdateInput;
    }) =>
      apiFetch<PortalKontrolAlat>(
        `/calibration-jobs/${jobId}/kontrol-alat/accessories/${accessoryId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
    },
  });
}

export function useRemovePortalKontrolAlatAccessory(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accessoryId: string) =>
      apiFetch<void>(`/calibration-jobs/${jobId}/kontrol-alat/accessories/${accessoryId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kaKey(jobId) });
    },
  });
}

export function useSignPortalKontrolAlat(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: KontrolAlatSignatureCreateInput) =>
      apiFetch<PortalKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat/signatures`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId] });
    },
  });
}
