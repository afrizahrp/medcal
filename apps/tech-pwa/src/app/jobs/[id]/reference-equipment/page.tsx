"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { ErrorBanner } from "../../../../components/feedback/error-banner";
import { LoadingState, ErrorState } from "../../../../components/ui/state-views";
import { formatApiError, formatReferenceEquipmentError } from "../../../../lib/api-errors";
import {
  canRecordReferenceEquipment,
  canReplaceReferenceEquipment,
  isReferenceEquipmentApprovalPending,
  isReferenceEquipmentLocked,
  isReferenceEquipmentUsable,
  type JobReferenceEquipmentReplaceItem,
  type TechReferenceEquipmentCandidate,
} from "../../../../lib/calibration/reference-equipment";
import { useJobQuery } from "../use-job-query";
import {
  useReferenceEquipmentCandidates,
  useReferenceEquipmentUsed,
  useReplaceReferenceEquipmentUsed,
} from "../use-reference-equipment-query";
import { JobHeaderBlock } from "../job-detail-ui";
import {
  ReferenceEquipmentValidityBadge,
  RecordedReferenceEquipmentList,
  brandModel,
} from "./reference-equipment-ui";

interface SelRow {
  checked: boolean;
  reason: string;
}

function GuardScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen title="Alat Referensi" showBack>
      {children}
    </Screen>
  );
}

export default function ReferenceEquipmentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id);
  const candidatesQuery = useReferenceEquipmentCandidates(id);
  const usedQuery = useReferenceEquipmentUsed(id);
  const mutation = useReplaceReferenceEquipmentUsed(id);

  const [selection, setSelection] = useState<Record<string, SelRow> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (selection || !candidatesQuery.data || !usedQuery.data) return;
    const usedByEquipmentId = new Map(usedQuery.data.map((u) => [u.equipmentId, u]));
    const next: Record<string, SelRow> = {};
    for (const c of candidatesQuery.data) {
      const rec = usedByEquipmentId.get(c.equipmentId);
      next[c.equipmentId] = { checked: Boolean(rec), reason: rec?.overrideReason ?? "" };
    }
    setSelection(next);
  }, [candidatesQuery.data, usedQuery.data, selection]);

  const canRecord = Boolean(capabilities?.calibrationJobRecordReferenceEquipmentUsed);
  const canOverride = Boolean(capabilities?.calibrationJobOverrideReferenceEquipmentValidity);

  const sortedCandidates = useMemo(() => {
    const list = candidatesQuery.data ?? [];
    return [...list].sort(
      (a, b) => Number(b.requiredForDeviceType) - Number(a.requiredForDeviceType),
    );
  }, [candidatesQuery.data]);

  if (jobQuery.isPending || candidatesQuery.isPending || usedQuery.isPending) {
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

  if (candidatesQuery.isError) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(candidatesQuery.error, "Gagal memuat kandidat alat referensi.")}
          onRetry={() => void candidatesQuery.refetch()}
        />
      </GuardScreen>
    );
  }

  if (usedQuery.isError || !usedQuery.data) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(usedQuery.error, "Gagal memuat alat referensi yang dicatat.")}
          onRetry={() => void usedQuery.refetch()}
        />
      </GuardScreen>
    );
  }

  const job = jobQuery.data;
  const used = usedQuery.data;

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

  if (!selection) {
    return (
      <GuardScreen>
        <LoadingState />
      </GuardScreen>
    );
  }

  const replaceOpen = canReplaceReferenceEquipment(job);
  const hasRecordedOverride = used.some((u) => u.validityOverridden);
  const technicianReadOnly = hasRecordedOverride && !canOverride;
  const pendingApproval = isReferenceEquipmentApprovalPending(job);

  if (!replaceOpen || technicianReadOnly) {
    const notice = !canRecordReferenceEquipment(job)
      ? job.startedAt === null
        ? "Job belum dimulai — alat referensi baru dapat dicatat setelah kalibrasi berjalan."
        : isReferenceEquipmentLocked(job)
          ? "Job sudah dikirim — daftar alat referensi tidak dapat diubah lagi."
          : null
      : pendingApproval
        ? "Menunggu Persetujuan MT"
        : technicianReadOnly
          ? "Daftar alat referensi berisi alat yang disetujui manajer teknis. Hanya manajer teknis yang dapat mengubahnya."
          : null;

    return (
      <GuardScreen>
        <JobHeaderBlock job={job} />
        <div className="space-y-4 p-4">
          {notice ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {notice}
            </div>
          ) : null}
          <RecordedReferenceEquipmentList used={used} />
          <Button variant="secondary" fullWidth onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
      </GuardScreen>
    );
  }

  if (sortedCandidates.length === 0) {
    return (
      <GuardScreen>
        <JobHeaderBlock job={job} />
        <div className="p-4">
          <p className="text-sm text-slate-600">
            Belum ada alat referensi yang dikonfirmasi pada work order job ini. Hubungi kantor.
          </p>
        </div>
      </GuardScreen>
    );
  }

  const toggle = (equipmentId: string, checked: boolean) =>
    setSelection((prev) =>
      prev ? { ...prev, [equipmentId]: { ...prev[equipmentId], checked } } : prev,
    );
  const setReason = (equipmentId: string, reason: string) =>
    setSelection((prev) =>
      prev ? { ...prev, [equipmentId]: { ...prev[equipmentId], reason } } : prev,
    );

  const missingOverrideReason =
    canOverride &&
    sortedCandidates.some((c) => {
      const row = selection[c.equipmentId];
      if (!row?.checked || isReferenceEquipmentUsable(c.validity.status)) return false;
      return row.reason.trim().length === 0;
    });

  function handleSubmit() {
    if (!selection) return;
    setSubmitError(null);
    const items: JobReferenceEquipmentReplaceItem[] = sortedCandidates
      .filter((c) => selection[c.equipmentId]?.checked)
      .map((c) =>
        isReferenceEquipmentUsable(c.validity.status)
          ? { equipmentId: c.equipmentId }
          : canOverride
            ? {
                equipmentId: c.equipmentId,
                override: { reason: selection[c.equipmentId].reason.trim() },
              }
            : { equipmentId: c.equipmentId },
      );
    mutation.mutate(items, {
      onSuccess: () => router.back(),
      onError: (err) =>
        setSubmitError(formatReferenceEquipmentError(err, "Gagal menyimpan alat referensi.")),
    });
  }

  return (
    <Screen
      title="Alat Referensi"
      showBack
      footer={
        <StickyActionBar>
          <Button
            fullWidth
            disabled={mutation.isPending || missingOverrideReason}
            onClick={handleSubmit}
          >
            {mutation.isPending ? "Menyimpan…" : "Simpan alat referensi"}
          </Button>
        </StickyActionBar>
      }
    >
      <JobHeaderBlock job={job} />
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-600">
          Pilih alat referensi yang digunakan untuk kalibrasi job ini. Daftar ini menggantikan
          seluruh catatan sebelumnya.
        </p>

        {submitError ? <ErrorBanner message={submitError} /> : null}

        <ul className="flex flex-col gap-2">
          {sortedCandidates.map((c) => (
            <CandidateRow
              key={c.equipmentId}
              candidate={c}
              row={selection[c.equipmentId] ?? { checked: false, reason: "" }}
              canOverride={canOverride}
              onToggle={(checked) => toggle(c.equipmentId, checked)}
              onReason={(reason) => setReason(c.equipmentId, reason)}
            />
          ))}
        </ul>
      </div>
    </Screen>
  );
}

function CandidateRow({
  candidate: c,
  row,
  canOverride,
  onToggle,
  onReason,
}: {
  candidate: TechReferenceEquipmentCandidate;
  row: SelRow;
  canOverride: boolean;
  onToggle: (checked: boolean) => void;
  onReason: (reason: string) => void;
}) {
  const usable = isReferenceEquipmentUsable(c.validity.status);
  const inactive = !c.isActive;
  const needsOverride = !usable && !inactive;
  const checkboxDisabled = inactive;
  const bm = brandModel(c);

  return (
    <li
      className={
        needsOverride && row.checked
          ? "rounded-lg border border-amber-300 bg-amber-50 p-3"
          : "rounded-lg border border-slate-200 p-3"
      }
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0"
          checked={row.checked}
          disabled={checkboxDisabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-medium text-slate-900">{c.code}</span>
            {bm ? <span className="text-sm text-slate-600">{bm}</span> : null}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {c.equipmentTypeName}
            {c.serialNumber ? ` · SN ${c.serialNumber}` : ""}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ReferenceEquipmentValidityBadge status={c.validity.status} />
            {inactive ? (
              <span className="rounded-md bg-slate-400 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                Nonaktif
              </span>
            ) : null}
          </span>
          {!c.requiredForDeviceType ? (
            <span className="mt-1 block text-xs text-slate-400">
              Tidak wajib untuk jenis alat ini.
            </span>
          ) : null}
          {needsOverride && !canOverride ? (
            <span className="mt-1 block text-xs text-amber-700">
              Kalibrasi tidak valid — simpan lalu ajukan persetujuan manajer teknis. Alat ini belum
              dapat dipakai sampai disetujui.
            </span>
          ) : null}
        </span>
      </label>

      {needsOverride && canOverride && row.checked ? (
        <div className="mt-2 pl-8">
          <label htmlFor={`override-${c.equipmentId}`} className="block text-xs font-medium text-amber-800">
            Alasan override (wajib)
          </label>
          <textarea
            id={`override-${c.equipmentId}`}
            maxLength={2000}
            rows={2}
            value={row.reason}
            onChange={(e) => onReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-base"
          />
        </div>
      ) : null}
    </li>
  );
}
