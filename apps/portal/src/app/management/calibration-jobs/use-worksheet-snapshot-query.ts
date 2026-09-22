"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { JobWorksheetRevisionInput } from "@medcal/shared";
import { CALIBRATION_JOBS_QUERY_KEY } from "./use-calibration-jobs-query";

export interface PortalWorksheetSnapshotItem {
  id: string;
  sourceCalibrationTestPointId: string;
  deviceCalibrationParameterId: string;
  parameterCode: string;
  parameterName: string;
  sequence: number;
  settingLabel: string;
  excludedAt: string | null;
  excludedByUserId: string | null;
  excludedByName: string | null;
  exclusionReason: string | null;
}

export interface PortalWorksheetSnapshot {
  activeCount: number;
  excludedCount: number;
  items: PortalWorksheetSnapshotItem[];
}

export function useWorksheetSnapshot(jobId: string | undefined) {
  return useQuery({
    queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId, "worksheet-snapshot"],
    queryFn: () => apiFetch<PortalWorksheetSnapshot>(`/calibration-jobs/${jobId}/worksheet-snapshot`),
    enabled: Boolean(jobId),
  });
}

export function useReviseWorksheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, input }: { jobId: string; input: JobWorksheetRevisionInput }) =>
      apiFetch<PortalWorksheetSnapshot>(`/calibration-jobs/${jobId}/worksheet-revisions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [CALIBRATION_JOBS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [CALIBRATION_JOBS_QUERY_KEY, variables.jobId, "measurement-parameters"],
      });
      queryClient.invalidateQueries({
        queryKey: [CALIBRATION_JOBS_QUERY_KEY, variables.jobId, "measurement-results"],
      });
      queryClient.invalidateQueries({
        queryKey: [CALIBRATION_JOBS_QUERY_KEY, variables.jobId, "worksheet-snapshot"],
      });
    },
  });
}
