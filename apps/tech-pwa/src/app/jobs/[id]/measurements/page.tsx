"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/state-views";
import { ErrorBanner } from "../../../../components/feedback/error-banner";
import { formatApiError } from "../../../../lib/api-errors";
import {
  capabilityGroupSections,
  hasCapabilityGroups,
  measurementLockedReason,
} from "../../../../lib/calibration/measurement";
import { canSubmitForReview } from "../../../../lib/calibration/quality-review";
import { isReferenceEquipmentApprovalPending } from "../../../../lib/calibration/reference-equipment";
import { useJobQuery, useSubmitForReview } from "../use-job-query";
import { JobHeaderBlock } from "../job-detail-ui";
import { useMeasurementParameters, useMeasurementResults } from "./use-measurements-query";
import { MeasurementCapabilityGroupList, MeasurementParameterListRow } from "./measurements-ui";

function GuardScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen title="Hasil Pengukuran" showBack>
      {children}
    </Screen>
  );
}

export default function MeasurementsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id, { poll: true });
  const parametersQuery = useMeasurementParameters(id);
  const resultsQuery = useMeasurementResults(id);
  const submitMutation = useSubmitForReview(id);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canRecord = Boolean(capabilities?.calibrationJobRecordMeasurement);

  const { rowsByParameter, gridRowsByParameter } = useMemo(() => {
    const a = new Map<string, NonNullable<typeof resultsQuery.data>>();
    const b = new Map<string, NonNullable<typeof resultsQuery.data>>();
    const attempt = jobQuery.data?.currentAttempt ?? 1;
    for (const row of resultsQuery.data ?? []) {
      if (row.attemptNumber !== attempt) continue;
      const map = row.calibrationTestPointId === null ? a : b;
      const list = map.get(row.deviceCalibrationParameterId) ?? [];
      list.push(row);
      map.set(row.deviceCalibrationParameterId, list);
    }
    return { rowsByParameter: a, gridRowsByParameter: b };
  }, [resultsQuery.data, jobQuery.data?.currentAttempt]);

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
          message={formatApiError(parametersQuery.error, "Gagal memuat parameter pengukuran.")}
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

  if (!canRecord) {
    return (
      <GuardScreen>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Aksi tidak tersedia.</p>
          <Button variant="secondary" onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
      </GuardScreen>
    );
  }

  const lockedReason = measurementLockedReason(job);
  const deviceType = parametersQuery.data?.deviceType ?? null;
  const parameters = parametersQuery.data?.parameters ?? [];
  const gridParameters = parametersQuery.data?.gridParameters ?? [];
  const capabilityGroups = parametersQuery.data?.capabilityGroups;
  const grouped = hasCapabilityGroups(capabilityGroups);
  const capabilitySections = grouped ? capabilityGroupSections(capabilityGroups) : [];
  const noneSupported = grouped
    ? capabilitySections.length === 0
    : parameters.length === 0 && gridParameters.length === 0;
  const showSubmit =
    Boolean(capabilities?.calibrationJobSubmitForReview) && canSubmitForReview(job);
  const unresolved =
    isReferenceEquipmentApprovalPending(job) || job.actionSignals.referenceEquipmentNeedsApproval;
  const pending = submitMutation.isPending;

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync();
      router.replace(`/jobs/${id}`);
    } catch (err) {
      setSubmitError(formatApiError(err, "Gagal mengirim."));
    }
  }

  return (
    <Screen
      title="Hasil Pengukuran"
      showBack
      footer={
        showSubmit ? (
          <StickyActionBar>
            <Button fullWidth disabled={pending || unresolved} onClick={() => void handleSubmit()}>
              {pending ? "Mengirim…" : "Kirim hasil ke Manajer Teknis"}
            </Button>
            {unresolved ? (
              <p className="mt-1 text-center text-xs text-amber-700">
                Selesaikan persetujuan alat referensi sebelum mengirim hasil ke Manajer Teknis.
              </p>
            ) : null}
          </StickyActionBar>
        ) : undefined
      }
    >
      <JobHeaderBlock job={job} />
      {submitError ? (
        <div className="px-4 pt-4">
          <ErrorBanner message={submitError} />
        </div>
      ) : null}
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-600">
          Parameter pengukuran{deviceType?.name ? ` untuk ${deviceType.name}` : ""}. Ketuk parameter
          untuk mencatat pembacaan.
        </p>

        {lockedReason ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {lockedReason}
          </div>
        ) : null}

        {deviceType === null ? (
          <EmptyState
            title="Jenis alat belum dapat ditentukan"
            subtitle="Parameter pengukuran diturunkan dari jenis alat job. Hubungi kantor."
          />
        ) : noneSupported ? (
          <EmptyState
            title="Tidak ada parameter pengukuran yang didukung"
            subtitle="Jenis alat ini tidak punya parameter pengukuran yang didukung."
          />
        ) : grouped ? (
          <MeasurementCapabilityGroupList
            jobId={id}
            sections={capabilitySections}
            rowsByParameter={rowsByParameter}
            gridRowsByParameter={gridRowsByParameter}
          />
        ) : (
          <>
            {parameters.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pembacaan langsung
                </h2>
                <ul className="flex flex-col gap-2">
                  {parameters.map((param) => (
                    <li key={param.id}>
                      <MeasurementParameterListRow
                        jobId={id}
                        param={param}
                        rows={rowsByParameter.get(param.id) ?? []}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {gridParameters.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Grid titik uji
                </h2>
                <ul className="flex flex-col gap-2">
                  {gridParameters.map((param) => (
                    <li key={param.id}>
                      <MeasurementParameterListRow
                        jobId={id}
                        param={param}
                        rows={gridRowsByParameter.get(param.id) ?? []}
                        pointCount={param.testPoints?.length ?? 0}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </Screen>
  );
}
