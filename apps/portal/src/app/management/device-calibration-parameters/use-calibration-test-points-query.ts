"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";

export const CALIBRATION_TEST_POINTS_QUERY_KEY = "calibration-test-points" as const;

/** One CalibrationTestPoint (Named Measurement Point) row, as returned by the API. */
export interface CalibrationTestPointApiRow {
  id: string;
  deviceCalibrationParameterId: string;
  sequence: number;
  settingLabel: string;
  settingValue: string | number | null;
  toleranceMin: string | number | null;
  toleranceMax: string | number | null;
  toleranceMinInclusive: boolean;
  toleranceMaxInclusive: boolean;
  toleranceNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CalibrationTestPointCreateRequest {
  settingLabel: string;
  settingValue?: number;
  toleranceMin?: number;
  toleranceMax?: number;
  toleranceMinInclusive?: boolean;
  toleranceMaxInclusive?: boolean;
  toleranceNote?: string;
}

export interface CalibrationTestPointUpdateRequest {
  settingLabel?: string;
  settingValue?: number | null;
  toleranceMin?: number | null;
  toleranceMax?: number | null;
  toleranceMinInclusive?: boolean;
  toleranceMaxInclusive?: boolean;
  toleranceNote?: string | null;
  isActive?: boolean;
}

/**
 * All test points (active AND inactive) for one DeviceCalibrationParameter —
 * the Portal management list, distinct from the runtime measurement-parameter
 * read path (which only ever sees active rows). Phase 4C.
 */
export function useCalibrationTestPoints(parameterId: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_TEST_POINTS_QUERY_KEY, parameterId],
    queryFn: () =>
      apiFetch<CalibrationTestPointApiRow[]>(
        `/device-calibration-parameters/${parameterId}/test-points`,
      ),
    enabled: Boolean(parameterId),
  });
}

/**
 * Same test-points-per-parameter fetch as `useCalibrationTestPoints`, run for
 * several parameters in parallel — used by the "grouped titik ukur entry"
 * sibling picker/grid to show each candidate's current point count/max
 * sequence. Shares the same query key, so results stay in sync with any
 * single-parameter view already cached.
 */
export function useCalibrationTestPointsForMany(parameterIds: string[]) {
  return useQueries({
    queries: parameterIds.map((parameterId) => ({
      queryKey: [CALIBRATION_TEST_POINTS_QUERY_KEY, parameterId],
      queryFn: () =>
        apiFetch<CalibrationTestPointApiRow[]>(
          `/device-calibration-parameters/${parameterId}/test-points`,
        ),
      enabled: Boolean(parameterId),
    })),
  });
}

export interface CalibrationTestPointBulkCellRequest {
  settingValue?: number;
  toleranceMin?: number;
  toleranceMax?: number;
  toleranceMinInclusive?: boolean;
  toleranceMaxInclusive?: boolean;
  toleranceNote?: string;
}

export interface CalibrationTestPointBulkCreateRequest {
  parameterIds: string[];
  rows: Array<{
    settingLabel: string;
    sequence: number;
    values: Record<string, CalibrationTestPointBulkCellRequest | null>;
  }>;
}

/**
 * POST /device-calibration-parameters/bulk-test-points — one shared row
 * (setpoint slot) created across N sibling parameters in a single
 * all-or-nothing batch. Invalidates every affected parameter's test-point
 * list on success.
 */
export function useCreateCalibrationTestPointsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalibrationTestPointBulkCreateRequest) =>
      apiFetch<CalibrationTestPointApiRow[]>("/device-calibration-parameters/bulk-test-points", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      variables.parameterIds.forEach((parameterId) => {
        queryClient.invalidateQueries({
          queryKey: [CALIBRATION_TEST_POINTS_QUERY_KEY, parameterId],
        });
      });
    },
  });
}

export function useCreateCalibrationTestPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      parameterId,
      input,
    }: {
      parameterId: string;
      input: CalibrationTestPointCreateRequest;
    }) =>
      apiFetch<CalibrationTestPointApiRow>(
        `/device-calibration-parameters/${parameterId}/test-points`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [CALIBRATION_TEST_POINTS_QUERY_KEY, variables.parameterId],
      });
    },
  });
}

export function useUpdateCalibrationTestPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      parameterId,
      testPointId,
      input,
    }: {
      parameterId: string;
      testPointId: string;
      input: CalibrationTestPointUpdateRequest;
    }) =>
      apiFetch<CalibrationTestPointApiRow>(
        `/device-calibration-parameters/${parameterId}/test-points/${testPointId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [CALIBRATION_TEST_POINTS_QUERY_KEY, variables.parameterId],
      });
    },
  });
}

/**
 * Persist the full display order. `testPointIds` must be the complete ordered
 * set (active AND inactive) currently owned by the parameter — the server
 * rejects a set mismatch. Simple invalidate+refetch: the list is a single flat
 * query, not a nested tree, so optimistic-update machinery (as used for
 * capability/parameter reorder) is not needed here.
 */
export function useReorderCalibrationTestPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      parameterId,
      testPointIds,
    }: {
      parameterId: string;
      testPointIds: string[];
    }) =>
      apiFetch<CalibrationTestPointApiRow[]>(
        `/device-calibration-parameters/${parameterId}/test-points/reorder`,
        { method: "PATCH", body: JSON.stringify({ testPointIds }) },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [CALIBRATION_TEST_POINTS_QUERY_KEY, variables.parameterId],
      });
    },
  });
}

export interface CalibrationTestPointGroupedReorderMove {
  parameterId: string;
  testPointIds: string[];
}

/**
 * Grouped Titik Ukur table's block-level chevron — moves every sibling
 * present in one block together in one atomic call, instead of one
 * `useReorderCalibrationTestPoints` call per sibling.
 */
export function useReorderCalibrationTestPointsGrouped() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (moves: CalibrationTestPointGroupedReorderMove[]) =>
      apiFetch<CalibrationTestPointApiRow[]>(
        "/device-calibration-parameters/grouped-test-points/reorder",
        { method: "PATCH", body: JSON.stringify({ moves }) },
      ),
    onSuccess: (_data, variables) => {
      variables.forEach((move) => {
        queryClient.invalidateQueries({
          queryKey: [CALIBRATION_TEST_POINTS_QUERY_KEY, move.parameterId],
        });
      });
    },
  });
}
