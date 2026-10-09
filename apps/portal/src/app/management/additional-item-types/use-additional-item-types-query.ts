"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  AdditionalItemTypeCreateInput,
  AdditionalItemTypeUpdateInput,
} from "@medcal/shared";

export const ADDITIONAL_ITEM_TYPES_QUERY_KEY = "additional-item-types" as const;

export type AdditionalItemServiceMode = "ON_SITE" | "SEND_TO_LAB";

export interface AdditionalItemTypeRow {
  id: string;
  companyId: string;
  code: string;
  name: string;
  unitLabel: string;
  /** Label of the optional second multiplier (e.g. "hari"); null = simple qty. */
  multiplierLabel: string | null;
  defaultUnitPrice: string | number | null;
  serviceMode: AdditionalItemServiceMode | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdditionalItemTypeListResponse {
  data: AdditionalItemTypeRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdditionalItemTypesQueryParams {
  search: string;
  isActive: boolean | "";
  /** Only types usable for a requisition of this mode (unrestricted or matching). */
  serviceMode?: AdditionalItemServiceMode;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: AdditionalItemTypesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  if (params.serviceMode) qs.set("serviceMode", params.serviceMode);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useAdditionalItemTypes(params: AdditionalItemTypesQueryParams, enabled = true) {
  return useQuery({
    queryKey: [
      ADDITIONAL_ITEM_TYPES_QUERY_KEY,
      params.search,
      params.isActive,
      params.serviceMode ?? "",
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<AdditionalItemTypeListResponse>(
        `/additional-item-types?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useCreateAdditionalItemType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdditionalItemTypeCreateInput) =>
      apiFetch<AdditionalItemTypeRow>("/additional-item-types", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ADDITIONAL_ITEM_TYPES_QUERY_KEY] });
    },
  });
}

export function useUpdateAdditionalItemType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdditionalItemTypeUpdateInput }) =>
      apiFetch<AdditionalItemTypeRow>(`/additional-item-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ADDITIONAL_ITEM_TYPES_QUERY_KEY] });
    },
  });
}

