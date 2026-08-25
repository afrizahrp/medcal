"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { UomCreateInput, UomListQuery, UomUpdateInput } from "@medcal/shared";
import type { UomListResponse, UomRow } from "./uoms-ui";

export const UOMS_QUERY_KEY = "uoms" as const;

export interface UomsQueryParams {
  search: string;
  category: UomListQuery["category"] | "";
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildUomsSearchParams(params: UomsQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.category) qs.set("category", params.category);
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useUoms(params: UomsQueryParams) {
  return useQuery({
    queryKey: [
      UOMS_QUERY_KEY,
      params.search,
      params.category,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<UomListResponse>(`/uoms?${buildUomsSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useUom(id: string | undefined) {
  return useQuery({
    queryKey: [UOMS_QUERY_KEY, id],
    queryFn: () => apiFetch<UomRow>(`/uoms/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateUom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UomCreateInput) =>
      apiFetch<UomRow>("/uoms", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (uom) => {
      queryClient.invalidateQueries({ queryKey: [UOMS_QUERY_KEY] });
      queryClient.setQueryData([UOMS_QUERY_KEY, uom.id], uom);
    },
  });
}

export function useUpdateUom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UomUpdateInput }) =>
      apiFetch<UomRow>(`/uoms/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [UOMS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [UOMS_QUERY_KEY, variables.id] });
    },
  });
}
