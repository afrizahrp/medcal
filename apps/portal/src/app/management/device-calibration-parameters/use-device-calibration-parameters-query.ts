"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  DeviceCalibrationParameterCreateInput,
  DeviceCalibrationParameterUpdateInput,
} from "@medcal/shared";
import type {
  DeviceCalibrationParameterGroupedResponse,
  DeviceCalibrationParameterListResponse,
  DeviceCalibrationParameterRow,
} from "./device-calibration-parameters-ui";

export const DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY = "device-calibration-parameters" as const;

export interface DeviceCalibrationParametersQueryParams {
  search: string;
  deviceTypeId: string;
  capabilityId: string;
  capabilityItemId: string;
  uomId: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildSearchParams(params: DeviceCalibrationParametersQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.deviceTypeId) qs.set("deviceTypeId", params.deviceTypeId);
  if (params.capabilityId) qs.set("capabilityId", params.capabilityId);
  if (params.capabilityItemId) qs.set("capabilityItemId", params.capabilityItemId);
  if (params.uomId) qs.set("uomId", params.uomId);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useDeviceCalibrationParameters(params: DeviceCalibrationParametersQueryParams) {
  return useQuery({
    queryKey: [
      DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY,
      params.search,
      params.deviceTypeId,
      params.capabilityId,
      params.capabilityItemId,
      params.uomId,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceCalibrationParameterListResponse>(
        `/device-calibration-parameters?${buildSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useDeviceCalibrationParameterGroups(params: {
  search: string;
  page: number;
  pageSize: number;
}) {
  const trimmed = params.search.trim();
  return useQuery({
    queryKey: [
      DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY,
      "grouped",
      trimmed,
      params.page,
      params.pageSize,
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (trimmed) qs.set("search", trimmed);
      qs.set("page", String(params.page));
      qs.set("pageSize", String(params.pageSize));
      return apiFetch<DeviceCalibrationParameterGroupedResponse>(
        `/device-calibration-parameters/grouped?${qs.toString()}`,
      );
    },
    placeholderData: (previous) => previous,
  });
}

export function useDeviceCalibrationParameter(id: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY, id],
    queryFn: () => apiFetch<DeviceCalibrationParameterRow>(`/device-calibration-parameters/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDeviceCalibrationParameter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceCalibrationParameterCreateInput) =>
      apiFetch<DeviceCalibrationParameterRow>("/device-calibration-parameters", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY] });
      queryClient.setQueryData([DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY, row.id], row);
    },
  });
}

export function useUpdateDeviceCalibrationParameter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceCalibrationParameterUpdateInput }) =>
      apiFetch<DeviceCalibrationParameterRow>(`/device-calibration-parameters/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY, variables.id],
      });
    },
  });
}

export function useDeleteDeviceCalibrationParameter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeviceCalibrationParameterRow>(`/device-calibration-parameters/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY] });
      queryClient.removeQueries({ queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY, id] });
    },
  });
}
