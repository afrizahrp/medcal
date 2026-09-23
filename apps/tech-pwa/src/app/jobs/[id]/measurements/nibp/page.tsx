"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../../../components/layout/screen";
import { Button } from "../../../../../components/ui/button";
import { LoadingState, ErrorState } from "../../../../../components/ui/state-views";
import { formatApiError } from "../../../../../lib/api-errors";
import {
  canRecordMeasurement,
  isGroupedMeasurementCapability,
  measurementLockedReason,
  type TechMeasurementResult,
} from "../../../../../lib/calibration/measurement";
import { useJobQuery } from "../../use-job-query";
import {
  useCreateMeasurementBatch,
  useMeasurementParameters,
  useMeasurementResults,
  useUpdateMeasurement,
} from "../use-measurements-query";
import { NibpGroupedGrid } from "../nibp-grouped-grid";

function GuardScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen title="NIBP" showBack>
      {children}
    </Screen>
  );
}

export default function NibpGroupedMeasurementsPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;
  const router = useRouter();
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id, { poll: true });
  const parametersQuery = useMeasurementParameters(id);
  const resultsQuery = useMeasurementResults(id);
  const batchMutation = useCreateMeasurementBatch(id);
  const updateMutation = useUpdateMeasurement(id);

  const canRecord = Boolean(capabilities?.calibrationJobRecordMeasurement);

  if (jobQuery.isPending || parametersQuery.isPending || resultsQuery.isPending) {
    return (
      <GuardScreen>
        <LoadingState />
      </GuardScreen>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(jobQuery.error, "Gagal memuat job.")}
          onRetry={() => void jobQuery.refetch()}
        />
      </GuardScreen>
    );
  }
  if (parametersQuery.isError) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(parametersQuery.error, "Gagal memuat parameter.")}
          onRetry={() => void parametersQuery.refetch()}
        />
      </GuardScreen>
    );
  }
  if (resultsQuery.isError) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(resultsQuery.error, "Gagal memuat hasil pengukuran.")}
          onRetry={() => void resultsQuery.refetch()}
        />
      </GuardScreen>
    );
  }

  const job = jobQuery.data;
  const group = (parametersQuery.data?.capabilityGroups ?? []).find((g) =>
    isGroupedMeasurementCapability(g.capability.code),
  );
  const siblings = group?.parameters ?? [];

  if (!canRecord || siblings.length === 0) {
    return (
      <GuardScreen>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            {siblings.length === 0 ? "Parameter NIBP tidak ditemukan pada job ini." : "Aksi tidak tersedia."}
          </p>
          <Button variant="secondary" onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
      </GuardScreen>
    );
  }

  const editable = canRecordMeasurement(job);
  const lockedReason = measurementLockedReason(job);
  const attempt = job.currentAttempt;
  const siblingIds = new Set(siblings.map((s) => s.id));
  const existingRows: TechMeasurementResult[] = (resultsQuery.data ?? []).filter(
    (r) =>
      siblingIds.has(r.deviceCalibrationParameterId) &&
      r.calibrationTestPointId !== null &&
      r.attemptNumber === attempt,
  );

  return (
    <NibpGroupedGrid
      job={job}
      siblings={siblings}
      existingRows={existingRows}
      editable={editable}
      lockedReason={lockedReason}
      onBatchCreate={(items) => batchMutation.mutateAsync(items)}
      onUpdate={(args) => updateMutation.mutateAsync(args)}
      onRefetch={() => resultsQuery.refetch()}
    />
  );
}
