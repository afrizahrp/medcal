"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { DeviceManufacturerCreateInput, DeviceManufacturerUpdateInput } from "@medcal/shared";
import type { DeviceManufacturerListResponse, DeviceManufacturerRow } from "./device-manufacturers-ui";

export const DEVICE_MANUFACTURERS_QUERY_KEY = "device-manufacturers" as const;

export interface DeviceManufacturersQueryParams {
  search: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DeviceManufacturersQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useDeviceManufacturers(params: DeviceManufacturersQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_MANUFACTURERS_QUERY_KEY,
      params.search,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceManufacturerListResponse>(
        `/device-manufacturers?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useDeviceManufacturer(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_MANUFACTURERS_QUERY_KEY, id],
    queryFn: () => apiFetch<DeviceManufacturerRow>(`/device-manufacturers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDeviceManufacturer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceManufacturerCreateInput) =>
      apiFetch<DeviceManufacturerRow>("/device-manufacturers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_MANUFACTURERS_QUERY_KEY] });
      queryClient.setQueryData([DEVICE_MANUFACTURERS_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDeviceManufacturer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceManufacturerUpdateInput }) =>
      apiFetch<DeviceManufacturerRow>(`/device-manufacturers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_MANUFACTURERS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DEVICE_MANUFACTURERS_QUERY_KEY, variables.id] });
    },
  });
}
