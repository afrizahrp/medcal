"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  KontrolAlatPatchInput,
  KontrolAlatAccessoryCreateInput,
  KontrolAlatAccessoryUpdateInput,
  KontrolAlatSignatureCreateInput,
} from "@medcal/shared";
import type { TechKontrolAlat } from "../../../../lib/calibration/types";

const kaKey = (jobId: string) => ["job", jobId, "kontrol-alat"] as const;

export function useKontrolAlat(jobId: string) {
  return useQuery({
    queryKey: kaKey(jobId),
    queryFn: () => apiFetch<TechKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat`),
    enabled: Boolean(jobId),
  });
}

export function usePatchKontrolAlat(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: KontrolAlatPatchInput) =>
      apiFetch<TechKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });
}

export function useAddKontrolAlatAccessory(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: KontrolAlatAccessoryCreateInput) =>
      apiFetch<TechKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat/accessories`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
    },
  });
}

export function useUpdateKontrolAlatAccessory(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accessoryId,
      input,
    }: {
      accessoryId: string;
      input: KontrolAlatAccessoryUpdateInput;
    }) =>
      apiFetch<TechKontrolAlat>(
        `/calibration-jobs/${jobId}/kontrol-alat/accessories/${accessoryId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
    },
  });
}

export function useRemoveKontrolAlatAccessory(jobId: string) {
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

export function useSignKontrolAlat(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: KontrolAlatSignatureCreateInput) =>
      apiFetch<TechKontrolAlat>(`/calibration-jobs/${jobId}/kontrol-alat/signatures`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(kaKey(jobId), data);
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });
}
