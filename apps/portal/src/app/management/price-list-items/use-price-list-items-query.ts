"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  PriceListItemCreateBody,
  PriceListItemUpdateBody,
} from "@medcal/shared";

export const PRICE_LIST_ITEMS_QUERY_KEY = "price-list-items" as const;

export interface PriceListItemRow {
  id: string;
  companyId: string;
  deviceTypeId: string;
  unitPrice: string | number;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deviceType: { id: string; code: string; name: string };
}

export interface PriceListItemListResponse {
  data: PriceListItemRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PriceListItemsQueryParams {
  search: string;
  deviceTypeId: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: PriceListItemsQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.deviceTypeId) qs.set("deviceTypeId", params.deviceTypeId);
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function usePriceListItems(params: PriceListItemsQueryParams) {
  return useQuery({
    queryKey: [
      PRICE_LIST_ITEMS_QUERY_KEY,
      params.search,
      params.deviceTypeId,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<PriceListItemListResponse>(
        `/price-list-items?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useCreatePriceListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PriceListItemCreateBody) =>
      apiFetch<PriceListItemRow>("/price-list-items", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PRICE_LIST_ITEMS_QUERY_KEY] });
    },
  });
}

export function useUpdatePriceListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PriceListItemUpdateBody }) =>
      apiFetch<PriceListItemRow>(`/price-list-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PRICE_LIST_ITEMS_QUERY_KEY] });
    },
  });
}

export function useDeletePriceListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PriceListItemRow>(`/price-list-items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PRICE_LIST_ITEMS_QUERY_KEY] });
    },
  });
}
