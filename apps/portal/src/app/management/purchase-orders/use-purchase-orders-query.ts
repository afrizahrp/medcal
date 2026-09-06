"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchBlob } from "@medcal/shared";
import type { PurchaseOrderCreateBody, PurchaseOrderUpdateBody } from "@medcal/shared";
import { QUOTATIONS_QUERY_KEY } from "../quotations/use-quotations-query";
import type {
  PurchaseOrderListResponse,
  PurchaseOrderRow,
  PurchaseOrderStatus,
} from "./purchase-orders-ui";

export const PURCHASE_ORDERS_QUERY_KEY = "purchase-orders" as const;

export interface PurchaseOrdersQueryParams {
  search: string;
  status: PurchaseOrderStatus | "";
  quotationId?: string;
  customerId?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: PurchaseOrdersQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.status) qs.set("status", params.status);
  if (params.quotationId) qs.set("quotationId", params.quotationId);
  if (params.customerId) qs.set("customerId", params.customerId);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

function invalidatePurchaseOrderQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: string,
) {
  queryClient.invalidateQueries({ queryKey: [PURCHASE_ORDERS_QUERY_KEY] });
  if (id) {
    queryClient.invalidateQueries({ queryKey: [PURCHASE_ORDERS_QUERY_KEY, id] });
  }
  queryClient.invalidateQueries({ queryKey: [QUOTATIONS_QUERY_KEY] });
}

export function usePurchaseOrders(params: PurchaseOrdersQueryParams, enabled = true) {
  return useQuery({
    queryKey: [
      PURCHASE_ORDERS_QUERY_KEY,
      params.search,
      params.status,
      params.quotationId,
      params.customerId,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<PurchaseOrderListResponse>(
        `/purchase-orders?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: [PURCHASE_ORDERS_QUERY_KEY, id],
    queryFn: () => apiFetch<PurchaseOrderRow>(`/purchase-orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchaseOrderCreateBody) =>
      apiFetch<PurchaseOrderRow>("/purchase-orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      invalidatePurchaseOrderQueries(queryClient, data.id);
      queryClient.setQueryData([PURCHASE_ORDERS_QUERY_KEY, data.id], data);
    },
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PurchaseOrderUpdateBody }) =>
      apiFetch<PurchaseOrderRow>(`/purchase-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidatePurchaseOrderQueries(queryClient, variables.id);
    },
  });
}

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PurchaseOrderRow>(`/purchase-orders/${id}/approve`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidatePurchaseOrderQueries(queryClient, id);
    },
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PurchaseOrderRow>(`/purchase-orders/${id}/cancel`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidatePurchaseOrderQueries(queryClient, id);
    },
  });
}

export async function fetchPurchaseOrderPdf(id: string): Promise<Blob> {
  const blob = await apiFetchBlob(`/purchase-orders/${id}/pdf`);
  if (blob.size === 0) {
    throw new Error("Empty purchase order PDF");
  }
  return blob;
}

export async function openPurchaseOrderPdf(id: string, filename?: string): Promise<void> {
  const blob = await fetchPurchaseOrderPdf(id);
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
