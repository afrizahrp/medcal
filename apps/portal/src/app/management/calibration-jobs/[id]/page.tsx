"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ShieldAlert, UserPlus, X } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { AccessDenied } from "../../../../components/access-denied";
import {
  AkdAklStatusBadge,
  ConfirmDialog,
  DetailField,
  JobStatusBadge,
  PageHeader,
  Surface,
  declaredAkdAkl,
  declaredDeviceName,
  formPageClass,
  formSurfaceClass,
  formatDateTime,
  resolvedDeviceType,
  type CalibrationJobDeviceCandidate,
  type CalibrationJobRow,
} from "../calibration-jobs-ui";
import {
  canAssignDevice,
  canDecideIdentity,
  canEscalateIdentity,
  formatCalibrationJobApiError,
  isIdentityGateLocked,
} from "../calibration-job-utils";
import {
  useAssignDevice,
  useCalibrationJob,
  useDeviceCandidates,
  useDecideIdentity,
  useEscalateIdentity,
} from "../use-calibration-jobs-query";

export default function CalibrationJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();

  const query = useCalibrationJob(params.id);
  const escalateMutation = useEscalateIdentity();
  const decideMutation = useDecideIdentity();
  const assignMutation = useAssignDevice();

  const [dialog, setDialog] = useState<"escalate" | "approve" | "reject" | "assign" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const job = query.data;

  if (isForbidden(query.error)) {
    return <AccessDenied />;
  }

  if (query.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Calibration Job tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/calibration-jobs", label: "Calibration Jobs" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Calibration job tidak ditemukan.</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat calibration job.</p>
      </div>
    );
  }

  const pending =
    escalateMutation.isPending ||
    decideMutation.isPending ||
    assignMutation.isPending;

  async function run<T>(action: () => Promise<T>, okMessage: string, fallback: string) {
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(okMessage);
      setDialog(null);
      await query.refetch();
    } catch (err) {
      setError(formatCalibrationJobApiError(err, fallback));
    }
  }

  const deviceType = resolvedDeviceType(job);
  const gateLocked = isIdentityGateLocked(job);
  const showEscalate =
    canEscalateIdentity(job) && Boolean(capabilities?.calibrationJobEscalateIdentity);
  const showDecide = canDecideIdentity(job) && Boolean(capabilities?.calibrationJobApproveIdentity);
  const showAssign = canAssignDevice(job) && Boolean(capabilities?.calibrationJobAssignDevice);

  return (
    <div className={formPageClass}>
      <PageHeader
        title={`${job.workOrder.number} · Unit ${job.unitOrdinal}/${job.unitTotal}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-jobs", label: "Calibration Jobs" },
          { label: `${job.workOrder.number} #${job.unitOrdinal}` },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Link
              href={`/work-orders/${job.workOrder.id}`}
              className="font-mono text-sm text-brand-700 hover:underline"
            >
              {job.workOrder.number}
            </Link>
            <span className="text-xs text-slate-400">
              Unit {job.unitOrdinal} dari {job.unitTotal}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <JobStatusBadge status={job.status} />
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/calibration-jobs">
                <ArrowLeft className="h-4 w-4" />
                Back to List
              </Link>
            </Button>
          </div>
        </div>

        {gateLocked ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Job ini sudah melewati tahap verifikasi identitas — eskalasi, keputusan AKD/AKL, dan
            assign device tidak lagi tersedia.
          </p>
        ) : null}

        <dl className="mt-4 space-y-4 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Declared Device Name">{declaredDeviceName(job)}</DetailField>
            <DetailField label="Resolved Device Type">
              {deviceType ? (
                <>
                  {deviceType.name}
                  <span className="ml-2 font-mono text-xs text-slate-400">{deviceType.code}</span>
                </>
              ) : (
                <span className="text-slate-400">Tidak dapat ditentukan</span>
              )}
            </DetailField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Declared AKD/AKL/NIE">{declaredAkdAkl(job)}</DetailField>
            <DetailField label="Technician Observed AKD/AKL">
              {job.technicianObservedAkdAkl ?? "—"}
            </DetailField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Technician Observed Serial">
              {job.technicianObservedSerial ?? "—"}
            </DetailField>
            <DetailField label="Requisition Line">
              {job.calibrationRequestItemId ? (
                <span className="font-mono text-xs text-slate-500">
                  {job.calibrationRequestItemId}
                </span>
              ) : (
                "—"
              )}
            </DetailField>
          </div>
        </dl>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Assigned Device</h3>
          {job.device ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <Link
                  href={`/devices/${job.device.id}`}
                  className="font-mono text-sm font-medium text-brand-700 hover:underline"
                >
                  {job.device.code ?? job.device.id}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  Serial: {job.device.serialNumber ?? "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Belum ada device yang di-assign. Identitas fisik biasanya baru diketahui setelah
              verifikasi di lokasi — ini keadaan normal.
            </p>
          )}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">AKD/AKL/NIE Approval</h3>
          <dl className="mt-3 space-y-4 text-sm">
            <DetailField label="Status">
              <AkdAklStatusBadge status={job.akdAklApprovalStatus} />
            </DetailField>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Decided By">{job.akdAklApprovedBy?.name ?? "—"}</DetailField>
              <DetailField label="Decided At">{formatDateTime(job.akdAklApprovedAt)}</DetailField>
            </div>
            <DetailField label="Decision / Escalation Note">
              {job.akdAklDecisionNote ? (
                <span className="whitespace-pre-wrap">{job.akdAklDecisionNote}</span>
              ) : (
                "—"
              )}
            </DetailField>
          </dl>
          <p className="mt-2 text-xs text-slate-400">
            v1: catatan eskalasi dan catatan keputusan berbagi satu kolom — catatan teknisi akan
            tertimpa oleh catatan manajer.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {showEscalate ? (
            <Button type="button" variant="outline" onClick={() => setDialog("escalate")}>
              <ShieldAlert className="h-4 w-4" />
              Escalate Identity
            </Button>
          ) : null}
          {showDecide ? (
            <>
              <Button type="button" onClick={() => setDialog("approve")}>
                <Check className="h-4 w-4" />
                Approve
              </Button>
              <Button type="button" variant="destructive" onClick={() => setDialog("reject")}>
                <X className="h-4 w-4" />
                Reject
              </Button>
            </>
          ) : null}
          {showAssign ? (
            <Button type="button" onClick={() => setDialog("assign")}>
              <UserPlus className="h-4 w-4" />
              Assign Device
            </Button>
          ) : null}
        </div>
      </Surface>

      <EscalateDialog
        open={dialog === "escalate"}
        job={job}
        pending={escalateMutation.isPending}
        onCancel={() => setDialog(null)}
        onSubmit={(input) =>
          run(
            () => escalateMutation.mutateAsync({ id: job.id, input }),
            "Identitas dieskalasi — menunggu keputusan TECHNICIAN_MANAGER.",
            "Gagal mengeskalasi identitas.",
          )
        }
      />

      <ConfirmDialog
        open={dialog === "approve"}
        title="Approve AKD/AKL/NIE?"
        description="Device ini akan dinyatakan lolos gate regulasi dan kalibrasi dapat dilanjutkan. APPROVED bersifat final."
        confirmLabel="Approve"
        loading={pending}
        onConfirm={() =>
          run(
            () => decideMutation.mutateAsync({ id: job.id, input: { decision: "APPROVE" } }),
            "AKD/AKL/NIE disetujui.",
            "Gagal menyetujui AKD/AKL.",
          )
        }
        onCancel={() => setDialog(null)}
      />

      <RejectDialog
        open={dialog === "reject"}
        pending={decideMutation.isPending}
        onCancel={() => setDialog(null)}
        onSubmit={(note) =>
          run(
            () =>
              decideMutation.mutateAsync({
                id: job.id,
                input: { decision: "REJECT", akdAklDecisionNote: note },
              }),
            "AKD/AKL/NIE ditolak.",
            "Gagal menolak AKD/AKL.",
          )
        }
      />

      <AssignDeviceDialog
        open={dialog === "assign"}
        job={job}
        assignPending={assignMutation.isPending}
        onCancel={() => setDialog(null)}
        onAssign={(deviceId) =>
          run(
            () => assignMutation.mutateAsync({ id: job.id, input: { deviceId } }),
            "Device berhasil di-assign.",
            "Gagal assign device.",
          )
        }
      />
    </div>
  );
}

function EscalateDialog({
  open,
  job,
  pending,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  job: CalibrationJobRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: { technicianObservedAkdAkl?: string | null; reason?: string }) => void;
}) {
  const [observed, setObserved] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setObserved(job.technicianObservedAkdAkl ?? "");
      setReason("");
    }
  }, [open, job.technicianObservedAkdAkl]);

  if (!open) return null;

  return (
    <DialogShell title="Escalate AKD/AKL/NIE" onCancel={onCancel} pending={pending}>
      <p className="mt-2 text-sm text-slate-600">
        Menaikkan job ini ke PENDING_REVIEW untuk keputusan TECHNICIAN_MANAGER.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        AKD/AKL/NIE yang diamati di lokasi
        <Input
          value={observed}
          onChange={(e) => setObserved(e.target.value)}
          placeholder="Kosongkan jika tidak ada sama sekali"
          className="mt-1"
        />
      </label>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Alasan eskalasi (opsional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </label>
      <DialogActions
        pending={pending}
        confirmLabel="Escalate"
        onCancel={onCancel}
        onConfirm={() =>
          onSubmit({
            technicianObservedAkdAkl: observed.trim() ? observed.trim() : "",
            reason: reason.trim() || undefined,
          })
        }
      />
    </DialogShell>
  );
}

function RejectDialog({
  open,
  pending,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!open) return null;

  return (
    <DialogShell title="Reject AKD/AKL/NIE" onCancel={onCancel} pending={pending}>
      <p className="mt-2 text-sm text-slate-600">
        Job ini tidak dapat dilanjutkan ke kalibrasi. Catatan wajib diisi.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Catatan keputusan
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </label>
      <DialogActions
        pending={pending}
        confirmLabel="Reject"
        destructive
        disabled={!note.trim()}
        onCancel={onCancel}
        onConfirm={() => onSubmit(note.trim())}
      />
    </DialogShell>
  );
}

function AssignDeviceDialog({
  open,
  job,
  assignPending,
  onCancel,
  onAssign,
}: {
  open: boolean;
  job: CalibrationJobRow;
  assignPending: boolean;
  onCancel: () => void;
  onAssign: (deviceId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(null);
    }
  }, [open]);

  const candidatesQuery = useDeviceCandidates(job.id, debouncedSearch, open);
  const candidates = candidatesQuery.data ?? [];

  if (!open) return null;

  return (
    <DialogShell title="Assign Device" onCancel={onCancel} pending={assignPending} wide>
      <div className="mt-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari serial / brand / model…"
        />
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {candidatesQuery.isLoading ? (
            <p className="text-sm text-slate-400">Memuat…</p>
          ) : candidatesQuery.isError ? (
            <p className="text-sm text-red-600">Gagal memuat kandidat device.</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-slate-500">
              Tidak ada device yang cocok. Device harus didaftarkan lebih dulu oleh admin/kantor
              melalui proses requisition/work order sebelum bisa di-assign ke job ini.
            </p>
          ) : (
            candidates.map((device: CalibrationJobDeviceCandidate) => (
              <label
                key={device.id}
                className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="device-candidate"
                  checked={selected === device.id}
                  onChange={() => setSelected(device.id)}
                />
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">
                    {device.serialNumber ?? device.code ?? device.id}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">
                    {[device.brand, device.model].filter(Boolean).join(" ") || "—"}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        <DialogActions
          pending={assignPending}
          confirmLabel="Assign"
          disabled={!selected}
          onCancel={onCancel}
          onConfirm={() => selected && onAssign(selected)}
        />
      </div>
    </DialogShell>
  );
}

function DialogShell({
  title,
  children,
  onCancel,
  pending,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  pending: boolean;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`mx-4 w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-lg bg-white p-6 shadow-xl`}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogActions({
  pending,
  confirmLabel,
  onCancel,
  onConfirm,
  disabled,
  destructive,
}: {
  pending: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Batal
      </Button>
      <Button
        type="button"
        variant={destructive ? "destructive" : "default"}
        onClick={onConfirm}
        disabled={pending || disabled}
      >
        {pending ? "Memproses…" : confirmLabel}
      </Button>
    </div>
  );
}
