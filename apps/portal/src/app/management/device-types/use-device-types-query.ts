"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { DeviceTypeCreateInput, DeviceTypeUpdateInput } from "@medcal/shared";
import type { DeviceTypeListResponse, DeviceTypeRow } from "./device-types-ui";

export const DEVICE_TYPES_QUERY_KEY = "device-types" as const;

export interface DeviceTypesQueryParams {
  search: string;
  categoryId: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DeviceTypesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.categoryId) qs.set("categoryId", params.categoryId);
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useDeviceTypes(params: DeviceTypesQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_TYPES_QUERY_KEY,
      params.search,
      params.categoryId,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceTypeListResponse>(`/device-types?${buildSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useDeviceType(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_TYPES_QUERY_KEY, id],
    queryFn: () => apiFetch<DeviceTypeRow>(`/device-types/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDeviceType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceTypeCreateInput) =>
      apiFetch<DeviceTypeRow>("/device-types", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_TYPES_QUERY_KEY] });
      queryClient.setQueryData([DEVICE_TYPES_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDeviceType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceTypeUpdateInput }) =>
      apiFetch<DeviceTypeRow>(`/device-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_TYPES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DEVICE_TYPES_QUERY_KEY, variables.id] });
    },
  });
}

export function useDeleteDeviceType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeviceTypeRow>(`/device-types/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_TYPES_QUERY_KEY] });
      queryClient.removeQueries({ queryKey: [DEVICE_TYPES_QUERY_KEY, id] });
    },
  });
}
