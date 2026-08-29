"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { DeviceTypeEquipmentRequirementCreateInput } from "@medcal/shared";
import type {
  EquipmentRequirementGroupedResponse,
  EquipmentRequirementRow,
} from "./equipment-requirements-ui";
import type { EquipmentTypeListResponse } from "../equipment-types/equipment-types-ui";

export const EQUIPMENT_REQUIREMENTS_QUERY_KEY = "equipment-requirements" as const;

export function useEquipmentRequirementGroups(params: {
  search: string;
  page: number;
  pageSize: number;
}) {
  const trimmed = params.search.trim();
  return useQuery({
    queryKey: [EQUIPMENT_REQUIREMENTS_QUERY_KEY, "grouped", trimmed, params.page, params.pageSize],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (trimmed) qs.set("search", trimmed);
      qs.set("page", String(params.page));
      qs.set("pageSize", String(params.pageSize));
      return apiFetch<EquipmentRequirementGroupedResponse>(
        `/device-type-equipment-requirements/grouped?${qs.toString()}`,
      );
    },
    placeholderData: (previous) => previous,
  });
}

/** Active equipment types for the "add requirement" picker. */
export function useActiveEquipmentTypeOptions(enabled: boolean) {
  return useQuery({
    queryKey: [EQUIPMENT_REQUIREMENTS_QUERY_KEY, "equipment-type-options"],
    queryFn: () =>
      apiFetch<EquipmentTypeListResponse>("/equipment-types?isActive=true&pageSize=100&sortBy=name&sortDir=asc"),
    enabled,
  });
}

export function useCreateEquipmentRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceTypeEquipmentRequirementCreateInput) =>
      apiFetch<EquipmentRequirementRow>("/device-type-equipment-requirements", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_REQUIREMENTS_QUERY_KEY] });
    },
  });
}

export function useDeleteEquipmentRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EquipmentRequirementRow>(`/device-type-equipment-requirements/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_REQUIREMENTS_QUERY_KEY] });
    },
  });
}
