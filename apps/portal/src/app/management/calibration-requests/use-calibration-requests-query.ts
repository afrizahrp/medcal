"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@medcal/shared";
import type {
  CalibrationRequestCreateInput,
  CalibrationRequestImportConfirmInput,
  CalibrationRequestImportPreviewResponse,
  CalibrationRequestListQuery,
  CalibrationRequestUpdateInput,
} from "@medcal/shared";
import type {
  CalibrationRequestListResponse,
  CalibrationRequestRow,
  CalibrationRequestStatus,
} from "./calibration-requests-ui";

export const CALIBRATION_REQUESTS_QUERY_KEY = "calibration-requests" as const;

export interface CalibrationRequestsQueryParams {
  search: string;
  status: CalibrationRequestStatus | "";
  customerId?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: CalibrationRequestsQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.status) qs.set("status", params.status);
  if (params.customerId) qs.set("customerId", params.customerId);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useCalibrationRequests(params: CalibrationRequestsQueryParams) {
  return useQuery({
    queryKey: [
      CALIBRATION_REQUESTS_QUERY_KEY,
      params.search,
      params.status,
      params.customerId,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<CalibrationRequestListResponse>(
        `/calibration-requests?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useCalibrationRequest(id: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_REQUESTS_QUERY_KEY, id],
    queryFn: () => apiFetch<CalibrationRequestRow>(`/calibration-requests/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCalibrationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalibrationRequestCreateInput) =>
      apiFetch<CalibrationRequestRow>("/calibration-requests", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY] });
      queryClient.setQueryData([CALIBRATION_REQUESTS_QUERY_KEY, data.id], data);
    },
  });
}

export function useUpdateCalibrationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CalibrationRequestUpdateInput }) =>
      apiFetch<CalibrationRequestRow>(`/calibration-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY, variables.id] });
    },
  });
}

export function useSubmitCalibrationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CalibrationRequestRow>(`/calibration-requests/${id}/submit`, {
        method: "POST",
      }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY, id] });
    },
  });
}

/**
 * Excel import — Preview. Raw fetch (multipart/form-data): the browser sets the
 * boundary; apiFetch would force Content-Type: application/json and break it.
 * Side-effect free on the server — no cache invalidation.
 */
export function useImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<CalibrationRequestImportPreviewResponse> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/calibration-requests/import/preview`,
        { method: "POST", credentials: "include", body: form },
      );
      if (!res.ok) {
        let data: ({ code?: string; message?: string } & Record<string, unknown>) | undefined;
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = undefined;
        }
        throw new ApiError(res.status, data?.message ?? res.statusText, data);
      }
      return (await res.json()) as CalibrationRequestImportPreviewResponse;
    },
  });
}

/** Excel import — Confirm. Transactional server-side; creates the requisition. */
export function useImportConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalibrationRequestImportConfirmInput) =>
      apiFetch<CalibrationRequestRow>("/calibration-requests/import/confirm", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY] });
      queryClient.setQueryData([CALIBRATION_REQUESTS_QUERY_KEY, data.id], data);
    },
  });
}

export function useCancelCalibrationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CalibrationRequestRow>(`/calibration-requests/${id}/cancel`, {
        method: "POST",
      }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY, id] });
    },
  });
}
