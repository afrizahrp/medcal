"use client";

import { useState } from "react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { formatCalibrationJobApiError } from "./calibration-job-utils";
import { formatDateTime } from "./calibration-jobs-ui";
import {
  useReviseWorksheet,
  useWorksheetSnapshot,
  type PortalWorksheetSnapshotItem,
} from "./use-worksheet-snapshot-query";

export function WorksheetRevisionPanel({
  jobId,
  canRevise,
}: {
  jobId: string;
  canRevise: boolean;
}) {
  const snapshot = useWorksheetSnapshot(jobId);
  const revise = useReviseWorksheet();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = snapshot.data?.items ?? [];
  const activeItems = items.filter((item) => item.excludedAt === null);
  const excludedItems = items.filter((item) => item.excludedAt !== null);

  function openDialog() {
    setSelected(new Set());
    setReason("");
    setError(null);
    setOpen(true);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (selected.size === 0) {
      setError("Pilih minimal satu titik yang dikeluarkan dari worksheet.");
      return;
    }
    if (!reason.trim()) {
      setError("Alasan revisi wajib diisi.");
      return;
    }
    const before = snapshot.data?.activeCount ?? activeItems.length;
    try {
      const result = await revise.mutateAsync({
        jobId,
        input: {
          excludeSourceCalibrationTestPointIds: [...selected],
          reason: reason.trim(),
        },
      });
      setNotice(`Worksheet direvisi: ${before} → ${result.activeCount} item`);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? formatCalibrationJobApiError(err, "Gagal menyimpan revisi worksheet.")
          : "Gagal menyimpan revisi worksheet.",
      );
    }
  }

  if (snapshot.isLoading) {
    return <p className="text-sm text-slate-400">Memuat worksheet…</p>;
  }
  if (snapshot.isError) {
    return <p className="text-sm text-red-600">Gagal memuat snapshot worksheet.</p>;
  }
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Worksheet snapshot: {snapshot.data?.activeCount ?? 0} item wajib
          {excludedItems.length > 0 ? ` · ${excludedItems.length} dikeluarkan` : ""}
        </p>
        {canRevise && activeItems.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={openDialog}>
            Revisi Worksheet
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {excludedItems.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Item dikeluarkan dari worksheet
          </p>
          <ul className="mt-2 space-y-1.5">
            {excludedItems.map((item) => (
              <li key={item.id} className="text-sm text-slate-700">
                <span className="font-medium">
                  {item.parameterName} · {item.settingLabel}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {item.exclusionReason ?? "—"}
                  {item.excludedAt
                    ? ` · ${formatDateTime(item.excludedAt)}${item.excludedByName ? ` · ${item.excludedByName}` : ""}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {open ? (
        <ReviseWorksheetDialog
          activeItems={activeItems}
          selected={selected}
          reason={reason}
          error={error}
          pending={revise.isPending}
          onToggle={toggle}
          onReasonChange={setReason}
          onCancel={() => setOpen(false)}
          onSave={() => void save()}
        />
      ) : null}
    </div>
  );
}

function ReviseWorksheetDialog({
  activeItems,
  selected,
  reason,
  error,
  pending,
  onToggle,
  onReasonChange,
  onCancel,
  onSave,
}: {
  activeItems: PortalWorksheetSnapshotItem[];
  selected: Set<string>;
  reason: string;
  error: string | null;
  pending: boolean;
  onToggle: (id: string) => void;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Revisi Worksheet</h3>
        <p className="mt-1 text-sm text-slate-600">
          Keluarkan titik yang tidak lagi berlaku pada job ini. Perubahan tidak
          menyalin master dan tidak menghapus riwayat pengukuran.
        </p>
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {activeItems.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(item.sourceCalibrationTestPointId)}
                  onChange={() => onToggle(item.sourceCalibrationTestPointId)}
                />
                <span>
                  <span className="font-medium">{item.settingLabel}</span>
                  <span className="block text-xs text-slate-500">
                    {item.parameterName} ({item.parameterCode})
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Alasan
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Batalkan
          </Button>
          <Button type="button" onClick={onSave} disabled={pending}>
            Simpan Revisi
          </Button>
        </div>
      </div>
    </div>
  );
}
