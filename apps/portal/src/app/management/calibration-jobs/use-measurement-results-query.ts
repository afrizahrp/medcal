"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import { CALIBRATION_JOBS_QUERY_KEY } from "./use-calibration-jobs-query";

/**
 * Read-only measurement catalog + rows for Portal MT review.
 * GET only — MT must not write MeasurementResult (no PATCH/POST here).
 *
 * Types mirror the existing API wire shape from
 * GET .../measurement-parameters and GET .../measurement-results
 * (see CalibrationJobDetail_Measurement_NormalValue_Audit.md).
 */

export interface PortalMeasurementTestPoint {
  id: string;
  sequence: number;
  settingLabel: string;
  settingValue?: string | null;
  toleranceMin?: string | null;
  toleranceMax?: string | null;
  toleranceNote?: string | null;
}

export interface PortalMeasurementParameter {
  id: string;
  code: string;
  name: string;
  /** Digits after the decimal for measured values — present on the wire. */
  decimalPlaces: number | null;
  uom: { code: string; symbol: string } | null;
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceNote: string | null;
  /** Capability / capability-item this parameter belongs to — used to group the
   * MT review table the same way the Calibration Parameter catalog is grouped. */
  capabilityName: string;
  capabilityItemName: string;
  testPoints?: PortalMeasurementTestPoint[];
}

/** LK-oriented tree from GET .../measurement-parameters — capabilities already
 * ordered by DeviceTypeCapabilityOrder.sortOrder, parameters by sortOrder. */
export interface PortalMeasurementCapabilityGroup {
  capability: { id: string; code: string; name: string };
  sortOrder: number | null;
  parameters: (PortalMeasurementParameter & { kind: "DIRECT" | "GRID" })[];
}

export interface PortalMeasurementParametersResponse {
  deviceType: { id: string; name: string } | null;
  parameters: PortalMeasurementParameter[];
  gridParameters: PortalMeasurementParameter[];
  capabilityGroups: PortalMeasurementCapabilityGroup[];
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
  /** Snapshot of the bounds used for isWithinTolerance at write time. */
  isWithinTolerance: boolean | null;
  effectiveToleranceMin: string | null;
  effectiveToleranceMax: string | null;
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
