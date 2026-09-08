"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  MeasurementBatchItem,
  MeasurementUpdateInput,
  TechMeasurementParametersResponse,
  TechMeasurementResult,
} from "../../../../lib/calibration/measurement";

/**
 * Measurement-entry queries. Keys sit under ["job", id, …] so the job-detail
 * page's broad invalidations (["job", id]) sweep them too.
 *
 * No polling: measurement entry is single-technician data entry — the row this
 * screen writes is never concurrently edited by a second person. The job-detail
 * page already polls the job itself, so a Portal-side status change (submit /
 * QA) that locks entry still surfaces there within ~6s.
 */

const parametersKey = (id: string) => ["job", id, "measurement-parameters"] as const;
const resultsKey = (id: string) => ["job", id, "measurement-results"] as const;

export function useMeasurementParameters(id: string) {
  return useQuery({
    queryKey: parametersKey(id),
    queryFn: () =>
      apiFetch<TechMeasurementParametersResponse>(
        `/calibration-jobs/${id}/measurement-parameters`,
      ),
    enabled: Boolean(id),
  });
}

export function useMeasurementResults(id: string) {
  return useQuery({
    queryKey: resultsKey(id),
    queryFn: () =>
      apiFetch<TechMeasurementResult[]>(`/calibration-jobs/${id}/measurement-results`),
    enabled: Boolean(id),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ["jobs"] });
  queryClient.invalidateQueries({ queryKey: ["job", id] });
}

/** Create many new replicate rows in one request. */
export function useCreateMeasurementBatch(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: MeasurementBatchItem[]) =>
      apiFetch<TechMeasurementResult[]>(`/calibration-jobs/${id}/measurement-results/batch`, {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => invalidate(queryClient, id),
  });
}

/** Edit one already-saved row. */
export function useUpdateMeasurement(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      measurementId,
      input,
    }: {
      measurementId: string;
      input: MeasurementUpdateInput;
    }) =>
      apiFetch<TechMeasurementResult>(
        `/calibration-jobs/${id}/measurement-results/${measurementId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => invalidate(queryClient, id),
  });
}
