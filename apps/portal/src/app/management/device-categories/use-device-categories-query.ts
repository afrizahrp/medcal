"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { DeviceCategoryCreateInput, DeviceCategoryUpdateInput } from "@medcal/shared";
import type { DeviceCategoryListResponse, DeviceCategoryRow } from "./device-categories-ui";

export const DEVICE_CATEGORIES_QUERY_KEY = "device-categories" as const;

export interface DeviceCategoriesQueryParams {
  search: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DeviceCategoriesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useDeviceCategories(params: DeviceCategoriesQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_CATEGORIES_QUERY_KEY,
      params.search,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceCategoryListResponse>(
        `/device-categories?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useDeviceCategory(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_CATEGORIES_QUERY_KEY, id],
    queryFn: () => apiFetch<DeviceCategoryRow>(`/device-categories/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDeviceCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceCategoryCreateInput) =>
      apiFetch<DeviceCategoryRow>("/device-categories", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CATEGORIES_QUERY_KEY] });
      queryClient.setQueryData([DEVICE_CATEGORIES_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDeviceCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceCategoryUpdateInput }) =>
      apiFetch<DeviceCategoryRow>(`/device-categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CATEGORIES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DEVICE_CATEGORIES_QUERY_KEY, variables.id] });
    },
  });
}
