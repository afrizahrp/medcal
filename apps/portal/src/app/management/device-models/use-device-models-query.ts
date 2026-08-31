"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { DeviceModelCreateInput, DeviceModelUpdateInput } from "@medcal/shared";
import type { DeviceModelListResponse, DeviceModelRow } from "./device-models-ui";

export const DEVICE_MODELS_QUERY_KEY = "device-models" as const;

export interface DeviceModelsQueryParams {
  search: string;
  deviceTypeId: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DeviceModelsQueryParams): URLSearchParams {
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

export function useDeviceModels(params: DeviceModelsQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_MODELS_QUERY_KEY,
      params.search,
      params.deviceTypeId,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceModelListResponse>(`/device-models?${buildSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useDeviceModel(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_MODELS_QUERY_KEY, id],
    queryFn: () => apiFetch<DeviceModelRow>(`/device-models/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDeviceModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceModelCreateInput) =>
      apiFetch<DeviceModelRow>("/device-models", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_MODELS_QUERY_KEY] });
      queryClient.setQueryData([DEVICE_MODELS_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDeviceModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceModelUpdateInput }) =>
      apiFetch<DeviceModelRow>(`/device-models/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_MODELS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DEVICE_MODELS_QUERY_KEY, variables.id] });
    },
  });
}
