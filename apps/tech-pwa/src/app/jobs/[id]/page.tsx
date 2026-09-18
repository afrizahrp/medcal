"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../components/layout/screen";
import { StickyActionBar } from "../../../components/layout/sticky-action-bar";
import { Button, LinkButton } from "../../../components/ui/button";
import { shouldShowLengkapiKontrolAlatCta } from "../../../lib/calibration/kontrol-alat";
import { LoadingState, ErrorState } from "../../../components/ui/state-views";
import { formatApiError } from "../../../lib/api-errors";
import {
  canSubmitIdentityCorrection,
} from "../../../lib/calibration/identity-gate";
import {
  isReferenceEquipmentApprovalPending,
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
import { useReferenceEquipmentUsed, useSubmitReferenceEquipmentApproval } from "./use-reference-equipment-query";
import {
  useMeasurementParameters,
  useMeasurementResults,
} from "./measurements/use-measurements-query";
import {
  usePhysicalCheckItems,
  usePhysicalCheckResults,
} from "./physical-check/use-physical-check-query";
import {
  AssignedDeviceSection,
  CorrectionsListSection,
  DeclaredIdentitySection,
  IdentityIncompleteWarning,
  JobHeaderBlock,
  KontrolAlatSection,
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

  // Live refresh so a Portal-side decision (Identity Correction)
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
  const submitRefApprovalMutation = useSubmitReferenceEquipmentApproval(id);

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
  const showSubmitCorrection = Boolean(capabilities?.calibrationJobSubmitIdentityCorrection);
  const canRecordKontrolAlat = Boolean(capabilities?.calibrationJobRecordKontrolAlat);

  // WOL gate: SEND_TO_LAB jobs require completed & dual-signed Kontrol Alat.
  const isWol = job.workOrder.serviceMode === "SEND_TO_LAB";
  const kontrolAlatIncomplete = isWol && (job.kontrolAlat?.completedAt == null);
  const startGateBlocked = isWol && kontrolAlatIncomplete;
  const startGateReason = startGateBlocked
    ? "Kontrol Alat (F.MU.08) harus diisi dan ditandatangani sebelum memulai kalibrasi In Lab."
    : null;
  const showLengkapiKontrolAlat = shouldShowLengkapiKontrolAlatCta({
    serviceMode: job.workOrder.serviceMode,
    jobStatus: job.status,
    completedAt: job.kontrolAlat?.completedAt,
    canRecord: canRecordKontrolAlat,
  });

  // "Mulai Kalibrasi" — only while the job has not started yet.
  const showStart = Boolean(capabilities?.calibrationJobStart) && job.status === "PENDING";
  const showSubmitForReview =
    Boolean(capabilities?.calibrationJobSubmitForReview) && canSubmitForReview(job);
  const referenceApprovalUnresolved =
    isReferenceEquipmentApprovalPending(job) || job.actionSignals.referenceEquipmentNeedsApproval;
  // MoM #6: a pending BA never blocks bench work, only the handover to review.
  const identityCorrectionUnresolved = job.actionSignals.identityCorrectionPending;
  const submitBlockedReason = identityCorrectionUnresolved
    ? "Koreksi identitas masih menunggu keputusan manajer teknis. Selesaikan dulu sebelum mengirim hasil ke review mutu."
    : referenceApprovalUnresolved
      ? "Selesaikan persetujuan alat referensi sebelum mengirim hasil ke review mutu."
      : null;
  const showResume = canShowResumeAfterRework(
    job,
    Boolean(capabilities?.calibrationJobResumeAfterRework),
  );
  const showComplete = Boolean(capabilities?.calibrationJobComplete) && canCompleteJob(job);
  const showRecordReferenceEquipment = Boolean(
    capabilities?.calibrationJobRecordReferenceEquipmentUsed,
  );

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
        showLengkapiKontrolAlat ||
        showStart ||
        showResume ||
        showSubmitCorrection ||
        showSubmitForReview ||
        showComplete ? (
          <StickyActionBar>
            {showLengkapiKontrolAlat ? (
              <LinkButton href={`/jobs/${id}/kontrol-alat`} fullWidth>
                Lengkapi Kontrol Alat
              </LinkButton>
            ) : null}
            {showStart ? (
              <StartCalibrationAction
                onStart={() => startMutation.mutate()}
                pending={startMutation.isPending}
                error={
                  startMutation.isError
                    ? formatApiError(startMutation.error, "Gagal memulai kalibrasi.")
                    : null
                }
                gateBlocked={startGateBlocked}
                gateReason={startGateReason}
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
                disabled={submitBlockedReason !== null}
                disabledReason={submitBlockedReason}
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
      <IdentityIncompleteWarning job={job} />
      {isWol ? (
        <KontrolAlatSection
          jobId={id}
          kontrolAlat={job.kontrolAlat}
          canRecord={canRecordKontrolAlat}
        />
      ) : null}
      <DeclaredIdentitySection job={job} />
      <ObservedIdentitySection job={job} />
      <AssignedDeviceSection job={job} />
      {referenceEquipmentQuery.isPending ? (
        <LoadingState label="Memuat alat referensi…" />
      ) : referenceEquipmentQuery.isError ? (
        <ErrorState
          message={formatApiError(referenceEquipmentQuery.error, "Gagal memuat alat referensi.")}
          onRetry={() => void referenceEquipmentQuery.refetch()}
        />
      ) : (
        <ReferenceEquipmentSection
          job={job}
          used={referenceEquipmentQuery.data ?? []}
          canRecord={showRecordReferenceEquipment}
          canSubmitApproval={Boolean(capabilities?.calibrationJobSubmitReferenceEquipmentApproval)}
          submittingApproval={submitRefApprovalMutation.isPending}
          approvalError={
            submitRefApprovalMutation.isError
              ? formatApiError(submitRefApprovalMutation.error, "Gagal mengajukan persetujuan.")
              : null
          }
          onSubmitApproval={() => submitRefApprovalMutation.mutate()}
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
