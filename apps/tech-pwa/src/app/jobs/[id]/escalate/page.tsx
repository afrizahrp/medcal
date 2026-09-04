"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { ErrorBanner } from "../../../../components/feedback/error-banner";
import { LoadingState, ErrorState } from "../../../../components/ui/state-views";
import { formatApiError } from "../../../../lib/api-errors";
import { canEscalateIdentity } from "../../../../lib/calibration/identity-gate";
import { useEscalateIdentity, useJobQuery } from "../use-job-query";

export default function EscalateIdentityPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id);
  const mutation = useEscalateIdentity(id);

  const [technicianObservedAkdAkl, setTechnicianObservedAkdAkl] = useState("");
  const [reason, setReason] = useState("");

  if (jobQuery.isPending) {
    return (
      <Screen title="Eskalasi AKD/AKL" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <Screen title="Eskalasi AKD/AKL" showBack>
        <ErrorState
          message={formatApiError(jobQuery.error, "Gagal memuat job.")}
          onRetry={() => void jobQuery.refetch()}
        />
      </Screen>
    );
  }

  const job = jobQuery.data;
  const allowed = Boolean(capabilities?.calibrationJobEscalateIdentity) && canEscalateIdentity(job);

  if (!allowed) {
    return (
      <Screen title="Eskalasi AKD/AKL" showBack>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Aksi tidak tersedia.</p>
          <Button variant="secondary" onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
      </Screen>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(
      {
        technicianObservedAkdAkl: technicianObservedAkdAkl.trim() || undefined,
        reason: reason.trim() || undefined,
      },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <Screen
      title="Eskalasi AKD/AKL"
      showBack
      footer={
        <StickyActionBar>
          <Button type="submit" form="escalate-form" fullWidth disabled={mutation.isPending}>
            {mutation.isPending ? "Mengirim…" : "Kirim eskalasi"}
          </Button>
        </StickyActionBar>
      }
    >
      <form id="escalate-form" onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-600">Menandai identitas alat untuk ditinjau manajer teknis.</p>

        {mutation.isError ? (
          <ErrorBanner message={formatApiError(mutation.error, "Gagal mengirim eskalasi.")} />
        ) : null}

        <div>
          <label htmlFor="observed-akd-akl" className="block text-sm font-medium text-slate-700">
            AKD/AKL hasil observasi (opsional)
          </label>
          <input
            id="observed-akd-akl"
            type="text"
            maxLength={120}
            value={technicianObservedAkdAkl}
            onChange={(e) => setTechnicianObservedAkdAkl(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
          />
          <p className="mt-1 text-xs text-slate-500">
            Nomor izin edar yang Anda baca dari label alat.
          </p>
        </div>

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-slate-700">
            Alasan (opsional)
          </label>
          <textarea
            id="reason"
            maxLength={2000}
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          />
        </div>
      </form>
    </Screen>
  );
}
