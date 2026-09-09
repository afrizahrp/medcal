"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../components/layout/screen";
import { StickyActionBar } from "../../../components/layout/sticky-action-bar";
import { Button, LinkButton } from "../../../components/ui/button";
import { LoadingState, ErrorState } from "../../../components/ui/state-views";
import { formatApiError } from "../../../lib/api-errors";
import {
  isIdentityGateLocked,
  canEscalateIdentity,
  canSubmitIdentityCorrection,
} from "../../../lib/calibration/identity-gate";
import {
  canRecordReferenceEquipment,
  isReferenceEquipmentLocked,
} from "../../../lib/calibration/reference-equipment";
import { markWizardEntryIntent } from "./identity-correction/wizard-nav";
import {
  canRecordMeasurement,
  measurementLockedReason,
} from "../../../lib/calibration/measurement";
import { useCorrectionsQuery, useJobQuery, useStartCalibration } from "./use-job-query";
import { useReferenceEquipmentUsed } from "./use-reference-equipment-query";
import {
  useMeasurementParameters,
  useMeasurementResults,
} from "./measurements/use-measurements-query";
import {
  ApprovalStatusSection,
  AssignedDeviceSection,
  CorrectionsListSection,
  DeclaredIdentitySection,
  JobHeaderBlock,
  MeasurementsSection,
  ObservedIdentitySection,
  ReferenceEquipmentSection,
  StartCalibrationAction,
} from "./job-detail-ui";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { capabilities } = useAuthz();

  // Live refresh so a Portal-side decision (AKD/AKL gate, Identity Correction)
  // surfaces here within ~6s. The wizard layout uses useJobQuery without polling.
  const jobQuery = useJobQuery(id, { poll: true });
  const correctionsQuery = useCorrectionsQuery(id, { poll: true });
  const referenceEquipmentQuery = useReferenceEquipmentUsed(id);
  const measurementParametersQuery = useMeasurementParameters(id);
  const measurementResultsQuery = useMeasurementResults(id);
  const startMutation = useStartCalibration(id);

  if (jobQuery.isPending) {
    return (
      <Screen title="Detail Job" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <Screen title="Detail Job" showBack>
        <ErrorState
          message={formatApiError(jobQuery.error, "Gagal memuat detail job.")}
          onRetry={() => void jobQuery.refetch()}
        />
      </Screen>
    );
  }

  const job = jobQuery.data;
  const gateLocked = isIdentityGateLocked(job);
  const canEscalate = canEscalateIdentity(job);
  const showEscalate = Boolean(capabilities?.calibrationJobEscalateIdentity);
  const showSubmitCorrection = Boolean(capabilities?.calibrationJobSubmitIdentityCorrection);
  // "Mulai Kalibrasi" — only while the job has not started yet.
  const showStart = Boolean(capabilities?.calibrationJobStart) && job.status === "PENDING";
  const showRecordReferenceEquipment = Boolean(
    capabilities?.calibrationJobRecordReferenceEquipmentUsed,
  );
  const referenceEquipmentLockedReason =
    job.startedAt === null
      ? "Job belum dimulai — alat referensi dicatat setelah kalibrasi berjalan."
      : isReferenceEquipmentLocked(job)
        ? "Job sudah dikirim — daftar alat referensi terkunci."
        : null;

  const measurementParams = measurementParametersQuery.data;
  const measurementRowsByParameter = new Map<
    string,
    NonNullable<typeof measurementResultsQuery.data>
  >();
  const measurementGridRowsByParameter = new Map<
    string,
    NonNullable<typeof measurementResultsQuery.data>
  >();
  for (const row of measurementResultsQuery.data ?? []) {
    if (row.attemptNumber !== job.currentAttempt) continue;
    const map =
      row.calibrationTestPointId === null ? measurementRowsByParameter : measurementGridRowsByParameter;
    const list = map.get(row.deviceCalibrationParameterId) ?? [];
    list.push(row);
    map.set(row.deviceCalibrationParameterId, list);
  }
  // Section shows while the job is IN_PROGRESS (entry), or later read-only if any
  // reading was already recorded. Hidden for PENDING with nothing entered yet.
  const showRecordMeasurement =
    Boolean(capabilities?.calibrationJobRecordMeasurement) &&
    (job.status === "IN_PROGRESS" ||
      measurementRowsByParameter.size > 0 ||
      measurementGridRowsByParameter.size > 0);

  return (
    <Screen
      title={job.workOrder.number}
      showBack
      footer={
        showStart || showEscalate || showSubmitCorrection ? (
          <StickyActionBar>
            {showStart ? (
              <StartCalibrationAction
                onStart={() => startMutation.mutate()}
                pending={startMutation.isPending}
                error={
                  startMutation.isError
                    ? formatApiError(startMutation.error, "Gagal memulai kalibrasi.")
                    : null
                }
              />
            ) : null}
            {showEscalate ? (
              canEscalate ? (
                <LinkButton href={`/jobs/${id}/escalate`} fullWidth>
                  Eskalasi AKD/AKL
                </LinkButton>
              ) : (
                <div>
                  <Button fullWidth disabled>
                    Eskalasi AKD/AKL
                  </Button>
                  <p className="mt-1 text-center text-xs text-slate-500">
                    {gateLocked
                      ? "Job sudah melewati tahap verifikasi identitas."
                      : "Eskalasi sedang ditinjau / sudah disetujui."}
                  </p>
                </div>
              )
            ) : null}
            {showSubmitCorrection ? (
              canSubmitIdentityCorrection(job) ? (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    markWizardEntryIntent(id);
                    router.replace(`/jobs/${id}/identity-correction`);
                  }}
                >
                  Ajukan Koreksi Identitas
                </Button>
              ) : (
                <div>
                  <Button variant="secondary" fullWidth disabled>
                    Ajukan Koreksi Identitas
                  </Button>
                  <p className="mt-1 text-center text-xs text-slate-500">
                    Job sudah melewati tahap verifikasi identitas.
                  </p>
                </div>
              )
            ) : null}
          </StickyActionBar>
        ) : undefined
      }
    >
      <JobHeaderBlock job={job} />
      <DeclaredIdentitySection job={job} />
      <ObservedIdentitySection job={job} />
      <AssignedDeviceSection job={job} />
      <ApprovalStatusSection job={job} />
      {referenceEquipmentQuery.isPending ? (
        <LoadingState label="Memuat alat referensi…" />
      ) : referenceEquipmentQuery.isError ? (
        <ErrorState
          message={formatApiError(referenceEquipmentQuery.error, "Gagal memuat alat referensi.")}
          onRetry={() => void referenceEquipmentQuery.refetch()}
        />
      ) : (
        <ReferenceEquipmentSection
          jobId={id}
          used={referenceEquipmentQuery.data ?? []}
          canRecord={showRecordReferenceEquipment}
          gateOpen={canRecordReferenceEquipment(job)}
          lockedReason={referenceEquipmentLockedReason}
        />
      )}
      {showRecordMeasurement ? (
        measurementParametersQuery.isPending || measurementResultsQuery.isPending ? (
          <LoadingState label="Memuat parameter pengukuran…" />
        ) : measurementParametersQuery.isError ? (
          <ErrorState
            message={formatApiError(
              measurementParametersQuery.error,
              "Gagal memuat parameter pengukuran.",
            )}
            onRetry={() => void measurementParametersQuery.refetch()}
          />
        ) : (
          <MeasurementsSection
            jobId={id}
            parameters={measurementParams?.parameters ?? []}
            gridParameters={measurementParams?.gridParameters ?? []}
            capabilityGroups={measurementParams?.capabilityGroups}
            rowsByParameter={measurementRowsByParameter}
            gridRowsByParameter={measurementGridRowsByParameter}
            deviceTypeResolved={(measurementParams?.deviceType ?? null) !== null}
            canRecord={showRecordMeasurement}
            entryOpen={canRecordMeasurement(job)}
            lockedReason={measurementLockedReason(job)}
          />
        )
      ) : null}
      {correctionsQuery.isPending ? (
        <LoadingState label="Memuat koreksi identitas…" />
      ) : correctionsQuery.isError ? (
        <ErrorState
          message={formatApiError(correctionsQuery.error, "Gagal memuat koreksi identitas.")}
          onRetry={() => void correctionsQuery.refetch()}
        />
      ) : (
        <CorrectionsListSection jobId={id} corrections={correctionsQuery.data ?? []} />
      )}
    </Screen>
  );
}
