"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { EquipmentTypeCreateInput, EquipmentTypeUpdateInput } from "@medcal/shared";
import type { EquipmentTypeListResponse, EquipmentTypeRow } from "./equipment-types-ui";

export const EQUIPMENT_TYPES_QUERY_KEY = "equipment-types" as const;

export interface EquipmentTypesQueryParams {
  search: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: EquipmentTypesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useEquipmentTypes(params: EquipmentTypesQueryParams) {
  return useQuery({
    queryKey: [
      EQUIPMENT_TYPES_QUERY_KEY,
      params.search,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<EquipmentTypeListResponse>(`/equipment-types?${buildSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useEquipmentType(id: string | undefined) {
  return useQuery({
    queryKey: [EQUIPMENT_TYPES_QUERY_KEY, id],
    queryFn: () => apiFetch<EquipmentTypeRow>(`/equipment-types/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateEquipmentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentTypeCreateInput) =>
      apiFetch<EquipmentTypeRow>("/equipment-types", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_TYPES_QUERY_KEY] });
      queryClient.setQueryData([EQUIPMENT_TYPES_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateEquipmentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EquipmentTypeUpdateInput }) =>
      apiFetch<EquipmentTypeRow>(`/equipment-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_TYPES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_TYPES_QUERY_KEY, variables.id] });
    },
  });
}
