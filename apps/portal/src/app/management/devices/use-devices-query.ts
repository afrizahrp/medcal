"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { DeviceCreateInput, DeviceUpdateInput } from "@medcal/shared";
import type { DeviceListResponse, DeviceRow, DeviceStatus } from "./devices-ui";

export const DEVICES_QUERY_KEY = "devices" as const;

export interface DevicesQueryParams {
  search: string;
  deviceTypeId: string;
  customerId: string;
  status: DeviceStatus | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DevicesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.deviceTypeId) qs.set("deviceTypeId", params.deviceTypeId);
  if (params.customerId) qs.set("customerId", params.customerId);
  if (params.status) qs.set("status", params.status);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useDevices(params: DevicesQueryParams) {
  return useQuery({
    queryKey: [
      DEVICES_QUERY_KEY,
      params.search,
      params.deviceTypeId,
      params.customerId,
      params.status,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceListResponse>(`/devices?${buildSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useDevice(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICES_QUERY_KEY, id],
    queryFn: () => apiFetch<DeviceRow>(`/devices/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceCreateInput) =>
      apiFetch<DeviceRow>("/devices", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICES_QUERY_KEY] });
      queryClient.setQueryData([DEVICES_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceUpdateInput }) =>
      apiFetch<DeviceRow>(`/devices/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DEVICES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DEVICES_QUERY_KEY, variables.id] });
    },
  });
}
