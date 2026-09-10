"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  DevicePhysicalCheckItemCreateInput,
  DevicePhysicalCheckItemUpdateInput,
} from "@medcal/shared";
import type {
  DevicePhysicalCheckItemGroupedResponse,
  DevicePhysicalCheckItemGroupRow,
  DevicePhysicalCheckItemListResponse,
  DevicePhysicalCheckItemRow,
} from "./device-physical-check-items-ui";

export const DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY = "device-physical-check-items" as const;

export interface DevicePhysicalCheckItemsQueryParams {
  search: string;
  deviceTypeId: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DevicePhysicalCheckItemsQueryParams): URLSearchParams {
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

export function useDevicePhysicalCheckItems(params: DevicePhysicalCheckItemsQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY,
      params.search,
      params.deviceTypeId,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DevicePhysicalCheckItemListResponse>(
        `/device-physical-check-items?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useDevicePhysicalCheckItemGroups(params: {
  search: string;
  isActive: boolean | "";
  page: number;
  pageSize: number;
}) {
  const trimmed = params.search.trim();
  return useQuery({
    queryKey: [
      DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY,
      "grouped",
      trimmed,
      params.isActive,
      params.page,
      params.pageSize,
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (trimmed) qs.set("search", trimmed);
      if (params.isActive !== "") qs.set("isActive", String(params.isActive));
      qs.set("page", String(params.page));
      qs.set("pageSize", String(params.pageSize));
      return apiFetch<DevicePhysicalCheckItemGroupedResponse>(
        `/device-physical-check-items/grouped?${qs.toString()}`,
      );
    },
    placeholderData: (previous) => previous,
  });
}

export function useDevicePhysicalCheckItem(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY, id],
    queryFn: () => apiFetch<DevicePhysicalCheckItemRow>(`/device-physical-check-items/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDevicePhysicalCheckItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DevicePhysicalCheckItemCreateInput) =>
      apiFetch<DevicePhysicalCheckItemRow>("/device-physical-check-items", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY] });
      queryClient.setQueryData([DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDevicePhysicalCheckItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DevicePhysicalCheckItemUpdateInput }) =>
      apiFetch<DevicePhysicalCheckItemRow>(`/device-physical-check-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY, variables.id],
      });
    },
  });
}

const GROUPED_KEY = [DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY, "grouped"] as const;

function mapGroup(
  data: DevicePhysicalCheckItemGroupedResponse | undefined,
  deviceTypeId: string,
  transform: (group: DevicePhysicalCheckItemGroupRow) => DevicePhysicalCheckItemGroupRow,
): DevicePhysicalCheckItemGroupedResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    data: data.data.map((group) =>
      group.deviceType.id === deviceTypeId ? transform(group) : group,
    ),
  };
}

/**
 * Reorder Physical Inspection items within one DeviceType. Optimistically
 * rewrites every cached grouped page, then rolls back on failure and refetches
 * on settle.
 */
export function useReorderDevicePhysicalCheckItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceTypeId, itemIds }: { deviceTypeId: string; itemIds: string[] }) =>
      apiFetch(`/device-physical-check-items/device-types/${deviceTypeId}/item-order`, {
        method: "PATCH",
        body: JSON.stringify({ itemIds }),
      }),
    onMutate: async ({ deviceTypeId, itemIds }) => {
      await queryClient.cancelQueries({ queryKey: GROUPED_KEY });
      const snapshot = queryClient.getQueriesData<DevicePhysicalCheckItemGroupedResponse>({
        queryKey: GROUPED_KEY,
      });
      queryClient.setQueriesData<DevicePhysicalCheckItemGroupedResponse>(
        { queryKey: GROUPED_KEY },
        (old) =>
          mapGroup(old, deviceTypeId, (group) => {
            const byId = new Map(group.items.map((item) => [item.id, item]));
            const items = itemIds
              .map((id) => byId.get(id))
              .filter((item): item is (typeof group.items)[number] => Boolean(item));
            return { ...group, items, count: items.length };
          }),
      );
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_PHYSICAL_CHECK_ITEMS_QUERY_KEY] });
    },
  });
}
