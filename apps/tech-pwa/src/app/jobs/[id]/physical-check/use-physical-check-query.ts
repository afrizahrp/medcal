"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  PhysicalCheckBatchItem,
  PhysicalCheckUpdateInput,
  TechPhysicalCheckItem,
  TechPhysicalCheckResult,
} from "../../../../lib/calibration/physical-check";

/**
 * Physical Inspection queries. Keys sit under ["job", id, …] so the job-detail
 * page's broad invalidations (["job", id]) sweep them too.
 *
 * No polling: single-technician data entry. Job detail already polls the job.
 */

const itemsKey = (id: string) => ["job", id, "physical-check-items"] as const;
const resultsKey = (id: string) => ["job", id, "physical-check-results"] as const;

export function usePhysicalCheckItems(id: string) {
  return useQuery({
    queryKey: itemsKey(id),
    queryFn: () =>
      apiFetch<TechPhysicalCheckItem[]>(`/calibration-jobs/${id}/physical-check-items`),
    enabled: Boolean(id),
  });
}

export function usePhysicalCheckResults(id: string) {
  return useQuery({
    queryKey: resultsKey(id),
    queryFn: () =>
      apiFetch<TechPhysicalCheckResult[]>(`/calibration-jobs/${id}/physical-check-results`),
    enabled: Boolean(id),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ["jobs"] });
  queryClient.invalidateQueries({ queryKey: ["job", id] });
}

/** Create many new PhysicalCheckResult rows in one request. */
export function useCreatePhysicalCheckBatch(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: PhysicalCheckBatchItem[]) =>
      apiFetch<TechPhysicalCheckResult[]>(
        `/calibration-jobs/${id}/physical-check-results/batch`,
        {
          method: "POST",
          body: JSON.stringify({ items }),
        },
      ),
    onSuccess: () => invalidate(queryClient, id),
  });
}

/** Edit one already-saved PhysicalCheckResult. */
export function useUpdatePhysicalCheck(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      resultId,
      input,
    }: {
      resultId: string;
      input: PhysicalCheckUpdateInput;
    }) =>
      apiFetch<TechPhysicalCheckResult>(
        `/calibration-jobs/${id}/physical-check-results/${resultId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => invalidate(queryClient, id),
  });
}
