"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  CalibrationJobEscalateIdentityInput,
  CalibrationJobIdentityDecisionInput,
} from "@medcal/shared";
import { WORK_ORDERS_QUERY_KEY } from "../work-orders/use-work-orders-query";
import type {
  CalibrationJobDeviceCandidate,
  CalibrationJobGroupedResponse,
  CalibrationJobListResponse,
  CalibrationJobRow,
} from "./calibration-jobs-ui";

export const CALIBRATION_JOBS_QUERY_KEY = "calibration-jobs" as const;

export interface CalibrationJobsQueryParams {
  search: string;
  workOrderId?: string;
  akdAklApprovalStatus: string;
  status: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: CalibrationJobsQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.workOrderId) qs.set("workOrderId", params.workOrderId);
  if (params.akdAklApprovalStatus) qs.set("akdAklApprovalStatus", params.akdAklApprovalStatus);
  if (params.status) qs.set("status", params.status);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

function invalidateCalibrationJobQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: string,
) {
  queryClient.invalidateQueries({ queryKey: [CALIBRATION_JOBS_QUERY_KEY] });
  if (id) {
    queryClient.invalidateQueries({ queryKey: [CALIBRATION_JOBS_QUERY_KEY, id] });
  }
  // An identity decision can change the job's WorkOrder-facing state.
  queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_QUERY_KEY] });
}

export function useCalibrationJobs(params: CalibrationJobsQueryParams, enabled = true) {
  return useQuery({
    queryKey: [
      CALIBRATION_JOBS_QUERY_KEY,
      params.search,
      params.workOrderId,
      params.akdAklApprovalStatus,
      params.status,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<CalibrationJobListResponse>(
        `/calibration-jobs?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
    enabled,
    // Near-real-time visibility of pending Identity Correction BAs raised from
    // the field — poll while the tab is focused, and refetch on focus.
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}

/**
 * SPK (WorkOrder)-grouped Calibration Jobs list. Same query params as
 * `useCalibrationJobs`; `page`/`pageSize` paginate WorkOrders, not jobs. Polled
 * on the same 6s cadence so aggregate action counts clear without a refresh.
 */
export function useCalibrationJobGroups(params: CalibrationJobsQueryParams, enabled = true) {
  return useQuery({
    queryKey: [
      CALIBRATION_JOBS_QUERY_KEY,
      "grouped",
      params.search,
      params.workOrderId,
      params.akdAklApprovalStatus,
      params.status,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<CalibrationJobGroupedResponse>(
        `/calibration-jobs/grouped?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
    enabled,
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}

export function useCalibrationJob(id: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, id],
    queryFn: () => apiFetch<CalibrationJobRow>(`/calibration-jobs/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * All calibration jobs for one Work Order, for the Work Order detail page's
 * per-item indicators (currently the "Perlu Persetujuan Alat" reference-equipment
 * badge — a computed state the WO payload itself does not carry). Polled on the
 * same 6s cadence as the Calibration Jobs list so the badge clears without a
 * manual refresh after a manager overrides. pageSize 100 is the schema max — a
 * single WO with >100 fanned-out units is not a real case.
 */
export function useWorkOrderCalibrationJobs(workOrderId: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, "by-work-order", workOrderId ?? ""],
    queryFn: () =>
      apiFetch<CalibrationJobListResponse>(
        `/calibration-jobs?workOrderId=${encodeURIComponent(workOrderId ?? "")}&pageSize=100`,
      ),
    enabled: Boolean(workOrderId),
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}

export function useDeviceCandidates(id: string | undefined, search: string, enabled: boolean) {
  const trimmed = search.trim();
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, id, "device-candidates", trimmed],
    queryFn: () =>
      apiFetch<CalibrationJobDeviceCandidate[]>(
        `/calibration-jobs/${id}/device-candidates${
          trimmed ? `?search=${encodeURIComponent(trimmed)}` : ""
        }`,
      ),
    enabled: Boolean(id) && enabled,
  });
}

export function useEscalateIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CalibrationJobEscalateIdentityInput }) =>
      apiFetch<CalibrationJobRow>(`/calibration-jobs/${id}/escalate-identity`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => invalidateCalibrationJobQueries(queryClient, variables.id),
  });
}

export function useDecideIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CalibrationJobIdentityDecisionInput }) =>
      apiFetch<CalibrationJobRow>(`/calibration-jobs/${id}/identity-decision`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => invalidateCalibrationJobQueries(queryClient, variables.id),
  });
}
