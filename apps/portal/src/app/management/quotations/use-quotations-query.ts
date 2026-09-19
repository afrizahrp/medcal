"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchBlob } from "@medcal/shared";
import type { QuotationCreateBody, QuotationReviseBody, QuotationUpdateBody } from "@medcal/shared";
import { CALIBRATION_REQUESTS_QUERY_KEY } from "../calibration-requests/use-calibration-requests-query";
import type { QuotationPreviewResponse } from "./quotation-preview";
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

/**
 * Read-only Price List preview for the New Quotation screen. Returns the same
 * unit price the quotation will be created with — no side effects. Keyed on the
 * requisition; the tariff does not depend on tax or header discount, so those
 * stay client-side (previewTotals) without a refetch.
 */
export function useQuotationPreview(requestId: string | undefined) {
  return useQuery({
    queryKey: [QUOTATIONS_QUERY_KEY, "preview", requestId],
    queryFn: () =>
      apiFetch<QuotationPreviewResponse>("/quotations/preview", {
        method: "POST",
        body: JSON.stringify({ requestId }),
      }),
    enabled: Boolean(requestId),
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuotationCreateBody) =>
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
    mutationFn: ({ id, input }: { id: string; input: QuotationUpdateBody }) =>
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

/**
 * MOM #1 — Transaction Revision + Immutable History. The `Revise` counterpart
 * to useUpdateQuotation, reachable once the quotation has left DRAFT.
 */
export function useReviseQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: QuotationReviseBody }) =>
      apiFetch<QuotationRow>(`/quotations/${id}/revise`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidateQuotationQueries(queryClient, variables.id);
      queryClient.invalidateQueries({ queryKey: [QUOTATIONS_QUERY_KEY, variables.id, "history"] });
    },
  });
}

export interface QuotationHistorySummary {
  id: string;
  quotationId: string;
  revisionNumber: number;
  number: string;
  status: QuotationStatus;
  subtotal: string;
  headerDiscountAmount: string;
  taxAmount: string;
  totalAmount: string;
  revisedAt: string;
  revisedBy: { id: string; name: string | null; email: string } | null;
}

export interface QuotationHistoryItem {
  id: string;
  sourceItemId: string;
  description: string;
  qty: string;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
}

export interface QuotationHistoryRevision extends QuotationHistorySummary {
  items: QuotationHistoryItem[];
}

/** MOM #1 — read-only revision list (header snapshots only). */
export function useQuotationHistory(id: string | undefined) {
  return useQuery({
    queryKey: [QUOTATIONS_QUERY_KEY, id, "history"],
    queryFn: () => apiFetch<QuotationHistorySummary[]>(`/quotations/${id}/history`),
    enabled: Boolean(id),
  });
}

/** MOM #1 — read-only single revision snapshot, including its items. */
export function useQuotationHistoryRevision(
  id: string | undefined,
  revisionNumber: number | undefined,
) {
  return useQuery({
    queryKey: [QUOTATIONS_QUERY_KEY, id, "history", revisionNumber],
    queryFn: () =>
      apiFetch<QuotationHistoryRevision>(`/quotations/${id}/history/${revisionNumber}`),
    enabled: Boolean(id) && revisionNumber !== undefined,
  });
}

export async function fetchQuotationPdf(id: string): Promise<Blob> {
  const blob = await apiFetchBlob(`/quotations/${id}/pdf`);
  if (blob.size === 0) {
    throw new Error("Empty quotation PDF");
  }
  return blob;
}

export async function openQuotationPdf(id: string, filename?: string): Promise<void> {
  const blob = await fetchQuotationPdf(id);
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (filename) anchor.download = filename;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
