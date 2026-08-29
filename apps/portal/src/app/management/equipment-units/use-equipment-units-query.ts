"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { EquipmentCreateInput, EquipmentUpdateInput } from "@medcal/shared";
import type { EquipmentUnitListResponse, EquipmentUnitRow } from "./equipment-units-ui";
import type { EquipmentTypeListResponse } from "../equipment-types/equipment-types-ui";

export const EQUIPMENT_UNITS_QUERY_KEY = "equipment-units" as const;

export interface EquipmentUnitsQueryParams {
  search: string;
  equipmentTypeId: string;
  isActive: boolean | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: EquipmentUnitsQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.equipmentTypeId) qs.set("equipmentTypeId", params.equipmentTypeId);
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useEquipmentUnits(params: EquipmentUnitsQueryParams) {
  return useQuery({
    queryKey: [
      EQUIPMENT_UNITS_QUERY_KEY,
      params.search,
      params.equipmentTypeId,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<EquipmentUnitListResponse>(`/equipment?${buildSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useEquipmentUnit(id: string | undefined) {
  return useQuery({
    queryKey: [EQUIPMENT_UNITS_QUERY_KEY, id],
    queryFn: () => apiFetch<EquipmentUnitRow>(`/equipment/${id}`),
    enabled: Boolean(id),
  });
}

/** Active equipment types for the form's Equipment Type picker. */
export function useEquipmentTypeOptions(enabled = true) {
  return useQuery({
    queryKey: [EQUIPMENT_UNITS_QUERY_KEY, "equipment-type-options"],
    queryFn: () =>
      apiFetch<EquipmentTypeListResponse>(
        "/equipment-types?isActive=true&pageSize=100&sortBy=name&sortDir=asc",
      ),
    enabled,
  });
}

export function useCreateEquipmentUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentCreateInput) =>
      apiFetch<EquipmentUnitRow>("/equipment", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_UNITS_QUERY_KEY] });
      queryClient.setQueryData([EQUIPMENT_UNITS_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateEquipmentUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EquipmentUpdateInput }) =>
      apiFetch<EquipmentUnitRow>(`/equipment/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_UNITS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_UNITS_QUERY_KEY, variables.id] });
    },
  });
}

export function useDeleteEquipmentUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EquipmentUnitRow>(`/equipment/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_UNITS_QUERY_KEY] });
      queryClient.removeQueries({ queryKey: [EQUIPMENT_UNITS_QUERY_KEY, id] });
    },
  });
}
