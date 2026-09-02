"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  CalibrationJobAssignDeviceInput,
  CalibrationJobEscalateIdentityInput,
  CalibrationJobIdentityDecisionInput,
  CalibrationJobRegisterDeviceInput,
} from "@medcal/shared";
import { WORK_ORDERS_QUERY_KEY } from "../work-orders/use-work-orders-query";
import type {
  CalibrationJobDeviceCandidate,
  CalibrationJobListResponse,
  CalibrationJobRow,
  DeviceAssignmentResult,
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
  // A device assignment changes the job's WorkOrder-facing state.
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
  });
}

export function useCalibrationJob(id: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, id],
    queryFn: () => apiFetch<CalibrationJobRow>(`/calibration-jobs/${id}`),
    enabled: Boolean(id),
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

export function useAssignDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CalibrationJobAssignDeviceInput }) =>
      apiFetch<DeviceAssignmentResult>(`/calibration-jobs/${id}/assign-device`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => invalidateCalibrationJobQueries(queryClient, variables.id),
  });
}

export function useRegisterDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CalibrationJobRegisterDeviceInput }) =>
      apiFetch<DeviceAssignmentResult>(`/calibration-jobs/${id}/register-device`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => invalidateCalibrationJobQueries(queryClient, variables.id),
  });
}
