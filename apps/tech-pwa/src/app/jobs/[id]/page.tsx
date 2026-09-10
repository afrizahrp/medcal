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
  shouldShowMeasurementSection,
} from "../../../lib/calibration/measurement";
import {
  canRecordPhysicalCheck,
  filterCurrentAttemptResults,
  physicalCheckLockedReason,
  shouldShowPhysicalCheckSection,
} from "../../../lib/calibration/physical-check";
import {
  canCompleteJob,
  canShowResumeAfterRework,
  canSubmitForReview,
} from "../../../lib/calibration/quality-review";
import {
  useCompleteJob,
  useCorrectionsQuery,
  useJobQuery,
  useResumeAfterRework,
  useStartCalibration,
  useSubmitForReview,
} from "./use-job-query";
import { useReferenceEquipmentUsed } from "./use-reference-equipment-query";
import {
  useMeasurementParameters,
  useMeasurementResults,
} from "./measurements/use-measurements-query";
import {
  usePhysicalCheckItems,
  usePhysicalCheckResults,
} from "./physical-check/use-physical-check-query";
import {
  ApprovalStatusSection,
  AssignedDeviceSection,
  CorrectionsListSection,
  DeclaredIdentitySection,
  JobHeaderBlock,
  MeasurementsSection,
  ObservedIdentitySection,
  PhysicalCheckSection,
  ReferenceEquipmentSection,
  StartCalibrationAction,
  SubmitForReviewAction,
  ResumeAfterReworkAction,
  CompleteJobAction,
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
  const physicalCheckItemsQuery = usePhysicalCheckItems(id);
  const physicalCheckResultsQuery = usePhysicalCheckResults(id);
  const measurementParametersQuery = useMeasurementParameters(id);
  const measurementResultsQuery = useMeasurementResults(id);
  const startMutation = useStartCalibration(id);
  const submitMutation = useSubmitForReview(id);
  const resumeMutation = useResumeAfterRework(id);
  const completeMutation = useCompleteJob(id);

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
  const showSubmitForReview =
    Boolean(capabilities?.calibrationJobSubmitForReview) && canSubmitForReview(job);
  const showResume = canShowResumeAfterRework(
    job,
    Boolean(capabilities?.calibrationJobResumeAfterRework),
  );
  const showComplete = Boolean(capabilities?.calibrationJobComplete) && canCompleteJob(job);
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
  const physicalCheckCurrentResults = filterCurrentAttemptResults(
    physicalCheckResultsQuery.data ?? [],
    job.currentAttempt,
  );
  const showRecordPhysicalCheck = shouldShowPhysicalCheckSection(
    job,
    Boolean(capabilities?.calibrationJobRecordPhysicalCheck),
    physicalCheckCurrentResults.length > 0,
  );

  // Section shows while IN_PROGRESS (entry), REWORK (locked until resume), or
  // later read-only if any reading was already recorded on the current attempt.
  const showRecordMeasurement = shouldShowMeasurementSection(
    job,
    Boolean(capabilities?.calibrationJobRecordMeasurement),
    measurementRowsByParameter.size > 0 || measurementGridRowsByParameter.size > 0,
  );

  return (
    <Screen
      title={job.workOrder.number}
      showBack
      footer={
        showStart ||
        showResume ||
        showEscalate ||
        showSubmitCorrection ||
        showSubmitForReview ||
        showComplete ? (
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
            {showResume ? (
              <ResumeAfterReworkAction
                onResume={() => resumeMutation.mutate()}
                pending={resumeMutation.isPending}
                error={
                  resumeMutation.isError
                    ? formatApiError(resumeMutation.error, "Gagal melanjutkan perbaikan.")
                    : null
                }
              />
            ) : null}
            {showSubmitForReview ? (
              <SubmitForReviewAction
                onSubmit={() => submitMutation.mutate()}
                pending={submitMutation.isPending}
                error={
                  submitMutation.isError
                    ? formatApiError(submitMutation.error, "Gagal mengirim.")
                    : null
                }
              />
            ) : null}
            {showComplete ? (
              <CompleteJobAction
                onComplete={() => completeMutation.mutate()}
                pending={completeMutation.isPending}
                error={
                  completeMutation.isError
                    ? formatApiError(completeMutation.error, "Gagal.")
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
      {showRecordPhysicalCheck ? (
        physicalCheckItemsQuery.isPending || physicalCheckResultsQuery.isPending ? (
          <LoadingState label="Memuat pemeriksaan fisik…" />
        ) : physicalCheckItemsQuery.isError ? (
          <ErrorState
            message={formatApiError(
              physicalCheckItemsQuery.error,
              "Gagal memuat katalog pemeriksaan fisik.",
            )}
            onRetry={() => void physicalCheckItemsQuery.refetch()}
          />
        ) : physicalCheckResultsQuery.isError ? (
          <ErrorState
            message={formatApiError(
              physicalCheckResultsQuery.error,
              "Gagal memuat hasil pemeriksaan fisik.",
            )}
            onRetry={() => void physicalCheckResultsQuery.refetch()}
          />
        ) : (
          <PhysicalCheckSection
            jobId={id}
            items={physicalCheckItemsQuery.data ?? []}
            currentAttemptResults={physicalCheckCurrentResults}
            canRecord={showRecordPhysicalCheck}
            entryOpen={canRecordPhysicalCheck(job)}
            lockedReason={physicalCheckLockedReason(job)}
          />
        )
      ) : null}
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
