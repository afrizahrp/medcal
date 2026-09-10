"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { ErrorBanner } from "../../../../components/feedback/error-banner";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/state-views";
import { formatApiError } from "../../../../lib/api-errors";
import {
  buildPhysicalCheckSavePlan,
  canRecordPhysicalCheck,
  draftFromResult,
  filterCurrentAttemptResults,
  physicalCheckLockedReason,
  type PhysicalCheckDraft,
} from "../../../../lib/calibration/physical-check";
import { useJobQuery } from "../use-job-query";
import { JobHeaderBlock } from "../job-detail-ui";
import { PhysicalCheckItemCard } from "./physical-check-ui";
import {
  useCreatePhysicalCheckBatch,
  usePhysicalCheckItems,
  usePhysicalCheckResults,
  useUpdatePhysicalCheck,
} from "./use-physical-check-query";

function GuardScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen title="Pemeriksaan Fisik" showBack>
      {children}
    </Screen>
  );
}

export default function PhysicalCheckPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id, { poll: true });
  const itemsQuery = usePhysicalCheckItems(id);
  const resultsQuery = usePhysicalCheckResults(id);
  const batchMutation = useCreatePhysicalCheckBatch(id);
  const updateMutation = useUpdatePhysicalCheck(id);

  const [drafts, setDrafts] = useState<Record<string, PhysicalCheckDraft>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canRecord = Boolean(capabilities?.calibrationJobRecordPhysicalCheck);
  const attempt = jobQuery.data?.currentAttempt ?? 1;

  const currentResults = useMemo(
    () => filterCurrentAttemptResults(resultsQuery.data ?? [], attempt),
    [resultsQuery.data, attempt],
  );

  const resultByItemId = useMemo(() => {
    const map = new Map<string, (typeof currentResults)[number]>();
    for (const row of currentResults) map.set(row.devicePhysicalCheckItemId, row);
    return map;
  }, [currentResults]);

  const catalog = itemsQuery.data ?? [];

  if (jobQuery.isPending || itemsQuery.isPending || resultsQuery.isPending) {
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

  if (itemsQuery.isError) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(itemsQuery.error, "Gagal memuat katalog pemeriksaan fisik.")}
          onRetry={() => void itemsQuery.refetch()}
        />
      </GuardScreen>
    );
  }

  if (resultsQuery.isError) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(resultsQuery.error, "Gagal memuat hasil pemeriksaan fisik.")}
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

  const editable = canRecordPhysicalCheck(job);
  const lockedReason = physicalCheckLockedReason(job);

  const draftFor = (itemId: string): PhysicalCheckDraft => {
    if (itemId in drafts) return drafts[itemId]!;
    return draftFromResult(resultByItemId.get(itemId));
  };

  const setDraft = (itemId: string, next: PhysicalCheckDraft) => {
    setSubmitError(null);
    setDrafts((prev) => ({ ...prev, [itemId]: next }));
  };

  const plan = buildPhysicalCheckSavePlan(catalog, currentResults, drafts);
  const nothingToSave = plan.creates.length === 0 && plan.updates.length === 0;
  const saving = batchMutation.isPending || updateMutation.isPending;

  async function handleSave() {
    if (!editable || saving || nothingToSave) return;
    setSubmitError(null);
    try {
      if (plan.creates.length > 0) await batchMutation.mutateAsync(plan.creates);
      for (const u of plan.updates) {
        await updateMutation.mutateAsync({ resultId: u.resultId, input: u.input });
      }
      await resultsQuery.refetch();
      setDrafts({});
    } catch (err) {
      setSubmitError(formatApiError(err, "Gagal menyimpan pemeriksaan fisik."));
      await resultsQuery.refetch();
    }
  }

  return (
    <Screen
      title="Pemeriksaan Fisik"
      showBack
      footer={
        editable && catalog.length > 0 ? (
          <StickyActionBar>
            <Button
              fullWidth
              disabled={saving || nothingToSave}
              onClick={() => void handleSave()}
            >
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </StickyActionBar>
        ) : undefined
      }
    >
      <JobHeaderBlock job={job} />
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-600">
          Catat kondisi fisik perangkat. Pilih BAIK atau TIDAK BAIK per item; catatan bersifat
          opsional.
        </p>

        {lockedReason ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {lockedReason}
          </div>
        ) : null}

        {submitError ? <ErrorBanner message={submitError} /> : null}

        {catalog.length === 0 ? (
          <EmptyState
            title="Tidak ada item pemeriksaan fisik"
            subtitle="Jenis alat ini tidak punya item pemeriksaan fisik yang didukung."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {catalog.map((item) => (
              <PhysicalCheckItemCard
                key={item.id}
                item={item}
                draft={draftFor(item.id)}
                editable={editable}
                onChange={(next) => setDraft(item.id, next)}
              />
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
