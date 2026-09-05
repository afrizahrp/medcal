"use client";

import { useParams } from "next/navigation";
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
import { useCorrectionsQuery, useJobQuery } from "./use-job-query";
import {
  ApprovalStatusSection,
  AssignedDeviceSection,
  CorrectionsListSection,
  DeclaredIdentitySection,
  JobHeaderBlock,
  ObservedIdentitySection,
} from "./job-detail-ui";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id);
  const correctionsQuery = useCorrectionsQuery(id);

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

  return (
    <Screen
      title={job.workOrder.number}
      showBack
      footer={
        showEscalate || showSubmitCorrection ? (
          <StickyActionBar>
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
                <LinkButton href={`/jobs/${id}/identity-correction`} variant="secondary" fullWidth>
                  Ajukan Koreksi Identitas
                </LinkButton>
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
