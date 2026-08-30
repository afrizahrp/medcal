"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  DeviceTypeAliasCreateInput,
  DeviceTypeAliasUpdateInput,
} from "@medcal/shared";

export const DEVICE_TYPE_ALIASES_QUERY_KEY = "device-type-aliases" as const;

export interface DeviceTypeAliasRow {
  id: string;
  deviceTypeId: string;
  alias: string;
  normalizedAlias: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deviceType: { id: string; code: string; name: string };
}

export interface DeviceTypeAliasListResponse {
  data: DeviceTypeAliasRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** GET /device-type-aliases/grouped — aliases grouped by Device Type. */
export interface DeviceTypeAliasGroupRow {
  deviceType: { id: string; code: string; name: string };
  categoryName: string | null;
  count: number;
  aliases: DeviceTypeAliasRow[];
}

export interface DeviceTypeAliasGroupedResponse {
  data: DeviceTypeAliasGroupRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalAliases: number;
  totalDeviceTypes: number;
}

export interface DeviceTypeAliasesQueryParams {
  search: string;
  deviceTypeId: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DeviceTypeAliasesQueryParams): URLSearchParams {
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

export function useDeviceTypeAliases(params: DeviceTypeAliasesQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_TYPE_ALIASES_QUERY_KEY,
      params.search,
      params.deviceTypeId,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceTypeAliasListResponse>(
        `/device-type-aliases?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useDeviceTypeAliasGroups(params: {
  search: string;
  page: number;
  pageSize: number;
}) {
  const trimmed = params.search.trim();
  return useQuery({
    queryKey: [DEVICE_TYPE_ALIASES_QUERY_KEY, "grouped", trimmed, params.page, params.pageSize],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (trimmed) qs.set("search", trimmed);
      qs.set("page", String(params.page));
      qs.set("pageSize", String(params.pageSize));
      return apiFetch<DeviceTypeAliasGroupedResponse>(
        `/device-type-aliases/grouped?${qs.toString()}`,
      );
    },
    placeholderData: (previous) => previous,
  });
}

export function useCreateDeviceTypeAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceTypeAliasCreateInput) =>
      apiFetch<DeviceTypeAliasRow>("/device-type-aliases", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_TYPE_ALIASES_QUERY_KEY] });
    },
  });
}

export function useUpdateDeviceTypeAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceTypeAliasUpdateInput }) =>
      apiFetch<DeviceTypeAliasRow>(`/device-type-aliases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_TYPE_ALIASES_QUERY_KEY] });
    },
  });
}

export function useDeleteDeviceTypeAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeviceTypeAliasRow>(`/device-type-aliases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_TYPE_ALIASES_QUERY_KEY] });
    },
  });
}
