"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { QuotationCreateInput, QuotationUpdateInput } from "@medcal/shared";
import { CALIBRATION_REQUESTS_QUERY_KEY } from "../calibration-requests/use-calibration-requests-query";
import type {
  QuotationListResponse,
  QuotationRow,
  QuotationStatus,
} from "./quotations-ui";

export const QUOTATIONS_QUERY_KEY = "quotations" as const;

export interface QuotationsQueryParams {
  search: string;
  status: QuotationStatus | "";
  requestId?: string;
  customerId?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: QuotationsQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.status) qs.set("status", params.status);
  if (params.requestId) qs.set("requestId", params.requestId);
  if (params.customerId) qs.set("customerId", params.customerId);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

function invalidateQuotationQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: [QUOTATIONS_QUERY_KEY] });
  if (id) {
    queryClient.invalidateQueries({ queryKey: [QUOTATIONS_QUERY_KEY, id] });
  }
}

export function useQuotations(params: QuotationsQueryParams, enabled = true) {
  return useQuery({
    queryKey: [
      QUOTATIONS_QUERY_KEY,
      params.search,
      params.status,
      params.requestId,
      params.customerId,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<QuotationListResponse>(`/quotations?${buildSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useQuotation(id: string | undefined) {
  return useQuery({
    queryKey: [QUOTATIONS_QUERY_KEY, id],
    queryFn: () => apiFetch<QuotationRow>(`/quotations/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuotationCreateInput) =>
      apiFetch<QuotationRow>("/quotations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      invalidateQuotationQueries(queryClient, data.id);
      queryClient.setQueryData([QUOTATIONS_QUERY_KEY, data.id], data);
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_REQUESTS_QUERY_KEY] });
    },
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: QuotationUpdateInput }) =>
      apiFetch<QuotationRow>(`/quotations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidateQuotationQueries(queryClient, variables.id);
    },
  });
}

export function useSendQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<QuotationRow>(`/quotations/${id}/send`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateQuotationQueries(queryClient, id);
    },
  });
}

export function useApproveQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<QuotationRow>(`/quotations/${id}/approve`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateQuotationQueries(queryClient, id);
    },
  });
}

export function useRejectQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<QuotationRow>(`/quotations/${id}/reject`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateQuotationQueries(queryClient, id);
    },
  });
}

export function useCancelQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<QuotationRow>(`/quotations/${id}/cancel`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateQuotationQueries(queryClient, id);
    },
  });
}
