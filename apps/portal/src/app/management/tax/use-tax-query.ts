"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { TaxCreateInput, TaxUpdateInput } from "@medcal/shared";
import type { TaxListResponse, TaxRow } from "./tax-ui";

export const TAX_QUERY_KEY = "taxes" as const;

export interface TaxesQueryParams {
  search: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildTaxesSearchParams(params: TaxesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useTaxes(params: TaxesQueryParams) {
  return useQuery({
    queryKey: [
      TAX_QUERY_KEY,
      params.search,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<TaxListResponse>(`/taxes?${buildTaxesSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useTax(id: string | undefined) {
  return useQuery({
    queryKey: [TAX_QUERY_KEY, id],
    queryFn: () => apiFetch<TaxRow>(`/taxes/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateTax() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaxCreateInput) =>
      apiFetch<TaxRow>("/taxes", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (tax) => {
      queryClient.invalidateQueries({ queryKey: [TAX_QUERY_KEY] });
      queryClient.setQueryData([TAX_QUERY_KEY, tax.id], tax);
    },
  });
}

export function useUpdateTax() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaxUpdateInput }) =>
      apiFetch<TaxRow>(`/taxes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [TAX_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [TAX_QUERY_KEY, variables.id] });
    },
  });
}
