"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import { CALIBRATION_JOBS_QUERY_KEY } from "./use-calibration-jobs-query";

/**
 * Read-only measurement catalog + rows for Portal MT review.
 * GET only — MT must not write MeasurementResult (no PATCH/POST here).
 */

export interface PortalMeasurementParameter {
  id: string;
  code: string;
  name: string;
  uom: { code: string; symbol: string } | null;
  testPoints?: { id: string; sequence: number; settingLabel: string }[];
}

export interface PortalMeasurementParametersResponse {
  deviceType: { id: string; name: string } | null;
  parameters: PortalMeasurementParameter[];
  gridParameters: PortalMeasurementParameter[];
}

export interface PortalMeasurementResult {
  id: string;
  deviceCalibrationParameterId: string;
  calibrationTestPointId: string | null;
  replicateIndex: number;
  attemptNumber: number;
  measuredValue: string | null;
  measuredBool: boolean | null;
  measuredText: string | null;
  note: string | null;
}

export function useMeasurementParameters(jobId: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId, "measurement-parameters"],
    queryFn: () =>
      apiFetch<PortalMeasurementParametersResponse>(
        `/calibration-jobs/${jobId}/measurement-parameters`,
      ),
    enabled: Boolean(jobId),
  });
}

export function useMeasurementResults(jobId: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId, "measurement-results"],
    queryFn: () => apiFetch<PortalMeasurementResult[]>(`/calibration-jobs/${jobId}/measurement-results`),
    enabled: Boolean(jobId),
  });
}
