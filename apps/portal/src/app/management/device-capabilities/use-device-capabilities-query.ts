"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  DeviceCapabilityCreateInput,
  DeviceCapabilityItemCreateInput,
  DeviceCapabilityItemUpdateInput,
  DeviceCapabilityUpdateInput,
} from "@medcal/shared";
import type {
  DeviceCapabilityItemRow,
  DeviceCapabilityListResponse,
  DeviceCapabilityRow,
} from "./device-capabilities-ui";

export const DEVICE_CAPABILITIES_QUERY_KEY = "device-capabilities" as const;
export const DEVICE_CAPABILITY_ITEMS_QUERY_KEY = "device-capability-items" as const;

export interface DeviceCapabilitiesQueryParams {
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DeviceCapabilitiesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

function invalidateCapabilityQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: [DEVICE_CAPABILITIES_QUERY_KEY] });
  if (id) {
    queryClient.invalidateQueries({ queryKey: [DEVICE_CAPABILITIES_QUERY_KEY, id] });
    queryClient.invalidateQueries({ queryKey: [DEVICE_CAPABILITY_ITEMS_QUERY_KEY, id] });
  }
}

export function useDeviceCapabilities(params: DeviceCapabilitiesQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_CAPABILITIES_QUERY_KEY,
      params.search,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceCapabilityListResponse>(
        `/device-capabilities?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useDeviceCapability(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_CAPABILITIES_QUERY_KEY, id],
    queryFn: () => apiFetch<DeviceCapabilityRow>(`/device-capabilities/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDeviceCapability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceCapabilityCreateInput) =>
      apiFetch<DeviceCapabilityRow>("/device-capabilities", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CAPABILITIES_QUERY_KEY] });
      queryClient.setQueryData([DEVICE_CAPABILITIES_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDeviceCapability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceCapabilityUpdateInput }) =>
      apiFetch<DeviceCapabilityRow>(`/device-capabilities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidateCapabilityQueries(queryClient, variables.id);
    },
  });
}

export function useDeleteDeviceCapability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeviceCapabilityRow>(`/device-capabilities/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CAPABILITIES_QUERY_KEY] });
      queryClient.removeQueries({ queryKey: [DEVICE_CAPABILITIES_QUERY_KEY, id] });
      queryClient.removeQueries({ queryKey: [DEVICE_CAPABILITY_ITEMS_QUERY_KEY, id] });
    },
  });
}

export function useDeviceCapabilityItems(capabilityId: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_CAPABILITY_ITEMS_QUERY_KEY, capabilityId],
    queryFn: () =>
      apiFetch<DeviceCapabilityItemRow[]>(`/device-capabilities/${capabilityId}/items`),
    enabled: Boolean(capabilityId),
  });
}

export function useCreateDeviceCapabilityItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      capabilityId,
      input,
    }: {
      capabilityId: string;
      input: DeviceCapabilityItemCreateInput;
    }) =>
      apiFetch<DeviceCapabilityItemRow>(`/device-capabilities/${capabilityId}/items`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidateCapabilityQueries(queryClient, variables.capabilityId);
    },
  });
}

export function useUpdateDeviceCapabilityItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      capabilityId,
      itemId,
      input,
    }: {
      capabilityId: string;
      itemId: string;
      input: DeviceCapabilityItemUpdateInput;
    }) =>
      apiFetch<DeviceCapabilityItemRow>(
        `/device-capabilities/${capabilityId}/items/${itemId}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: (_data, variables) => {
      invalidateCapabilityQueries(queryClient, variables.capabilityId);
    },
  });
}

export function useDeleteDeviceCapabilityItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ capabilityId, itemId }: { capabilityId: string; itemId: string }) =>
      apiFetch<DeviceCapabilityItemRow>(
        `/device-capabilities/${capabilityId}/items/${itemId}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, variables) => {
      invalidateCapabilityQueries(queryClient, variables.capabilityId);
    },
  });
}
