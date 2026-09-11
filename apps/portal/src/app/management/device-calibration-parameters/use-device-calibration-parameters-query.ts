"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  DeviceCalibrationParameterCreateInput,
  DeviceCalibrationParameterUpdateInput,
} from "@medcal/shared";
import type {
  DeviceCalibrationParameterGroupedResponse,
  DeviceCalibrationParameterGroupRow,
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
  isActive: boolean | "";
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
  if (params.isActive !== "") qs.set("isActive", String(params.isActive));
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useDeviceCalibrationParameters(
  params: DeviceCalibrationParametersQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [
      DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY,
      params.search,
      params.deviceTypeId,
      params.capabilityId,
      params.capabilityItemId,
      params.uomId,
      params.isActive,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<DeviceCalibrationParameterListResponse>(
        `/device-calibration-parameters?${buildSearchParams(params).toString()}`,
      ),
    enabled: options?.enabled ?? true,
    placeholderData: (previous) => previous,
  });
}

export function useDeviceCalibrationParameterGroups(params: {
  search: string;
  isActive: boolean | "";
  page: number;
  pageSize: number;
}) {
  const trimmed = params.search.trim();
  return useQuery({
    queryKey: [
      DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY,
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

export interface DeviceCalibrationParameterCopyRequest {
  sourceDeviceTypeId: string;
  targetDeviceTypeId: string;
  parameterIds: string[];
}

export interface DeviceCalibrationParameterCopySkippedRow {
  sourceParameterId: string;
  name: string;
}

export interface DeviceCalibrationParameterCopyUnsupportedRow
  extends DeviceCalibrationParameterCopySkippedRow {
  entryStyle: string;
  valueType: string;
}

export interface DeviceCalibrationParameterCopyResponse {
  created: { id: string; code: string; name: string }[];
  skippedDuplicateName: DeviceCalibrationParameterCopySkippedRow[];
  skippedUnsupportedEntryStyle: DeviceCalibrationParameterCopyUnsupportedRow[];
}

/** POST /device-calibration-parameters/copy — see Stage 2 design doc. */
export function useCopyDeviceCalibrationParameters() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceCalibrationParameterCopyRequest) =>
      apiFetch<DeviceCalibrationParameterCopyResponse>("/device-calibration-parameters/copy", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY] });
    },
  });
}

const GROUPED_KEY = [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY, "grouped"] as const;

function mapGroup(
  data: DeviceCalibrationParameterGroupedResponse | undefined,
  deviceTypeId: string,
  transform: (group: DeviceCalibrationParameterGroupRow) => DeviceCalibrationParameterGroupRow,
): DeviceCalibrationParameterGroupedResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    data: data.data.map((group) =>
      group.deviceType.id === deviceTypeId ? transform(group) : group,
    ),
  };
}

function withFlatParameters(
  group: DeviceCalibrationParameterGroupRow,
): DeviceCalibrationParameterGroupRow {
  return { ...group, parameters: group.capabilities.flatMap((cap) => cap.parameters) };
}

/**
 * Reorder a device type's Capabilities. Optimistically rewrites every cached
 * grouped page, then rolls back on failure and refetches on settle.
 */
export function useReorderDeviceCalibrationCapabilities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deviceTypeId,
      capabilityIds,
    }: {
      deviceTypeId: string;
      capabilityIds: string[];
    }) =>
      apiFetch(`/device-calibration-parameters/device-types/${deviceTypeId}/capability-order`, {
        method: "PATCH",
        body: JSON.stringify({ capabilityIds }),
      }),
    onMutate: async ({ deviceTypeId, capabilityIds }) => {
      await queryClient.cancelQueries({ queryKey: GROUPED_KEY });
      const snapshot = queryClient.getQueriesData<DeviceCalibrationParameterGroupedResponse>({
        queryKey: GROUPED_KEY,
      });
      queryClient.setQueriesData<DeviceCalibrationParameterGroupedResponse>(
        { queryKey: GROUPED_KEY },
        (old) =>
          mapGroup(old, deviceTypeId, (group) => {
            const byId = new Map(group.capabilities.map((cap) => [cap.capability.id, cap]));
            const capabilities = capabilityIds
              .map((id) => byId.get(id))
              .filter((cap): cap is (typeof group.capabilities)[number] => Boolean(cap));
            return withFlatParameters({ ...group, capabilities });
          }),
      );
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY] });
    },
  });
}

/**
 * Reorder the parameters inside one (deviceType, capability) scope.
 * Optimistic with rollback, same as the capability reorder.
 */
export function useReorderDeviceCalibrationParameters() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deviceTypeId,
      capabilityId,
      parameterIds,
    }: {
      deviceTypeId: string;
      capabilityId: string;
      parameterIds: string[];
    }) =>
      apiFetch(
        `/device-calibration-parameters/device-types/${deviceTypeId}/capabilities/${capabilityId}/parameter-order`,
        { method: "PATCH", body: JSON.stringify({ parameterIds }) },
      ),
    onMutate: async ({ deviceTypeId, capabilityId, parameterIds }) => {
      await queryClient.cancelQueries({ queryKey: GROUPED_KEY });
      const snapshot = queryClient.getQueriesData<DeviceCalibrationParameterGroupedResponse>({
        queryKey: GROUPED_KEY,
      });
      queryClient.setQueriesData<DeviceCalibrationParameterGroupedResponse>(
        { queryKey: GROUPED_KEY },
        (old) =>
          mapGroup(old, deviceTypeId, (group) => {
            const capabilities = group.capabilities.map((cap) => {
              if (cap.capability.id !== capabilityId) return cap;
              const byId = new Map(cap.parameters.map((param) => [param.id, param]));
              const parameters = parameterIds
                .map((id) => byId.get(id))
                .filter((param): param is (typeof cap.parameters)[number] => Boolean(param));
              return { ...cap, parameters };
            });
            return withFlatParameters({ ...group, capabilities });
          }),
      );
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY] });
    },
  });
}
