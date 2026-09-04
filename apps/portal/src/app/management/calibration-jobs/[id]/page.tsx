"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, FileText, ShieldAlert, Upload, X } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { AccessDenied } from "../../../../components/access-denied";
import { SignatureImage } from "../signature-image";
import {
  AkdAklStatusBadge,
  ConfirmDialog,
  DetailField,
  IdentityCorrectionStatusBadge,
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
  canDecideIdentity,
  canEscalateIdentity,
  canSubmitIdentityCorrection,
  formatCalibrationJobApiError,
  isIdentityGateLocked,
  missingSignatureImageMessage,
  signersMissingImage,
  summarizeCorrectionChanges,
} from "../calibration-job-utils";
import {
  useCalibrationJob,
  useDeviceCandidates,
  useDecideIdentity,
  useEscalateIdentity,
} from "../use-calibration-jobs-query";
import {
  useDecideIdentityCorrection,
  useIdentityCorrections,
  useSubmitIdentityCorrection,
  useUploadIdentityCorrectionSignature,
  type IdentityCorrection,
  type IdentityCorrectionSignature,
  type IdentityCorrectionSubmitInput,
  type SignatureStatus,
} from "../use-identity-corrections-query";

const SIGNER_ROLES = ["TECHNICIAN", "CUSTOMER"] as const;
type SignerRole = (typeof SIGNER_ROLES)[number];
const SIGNER_LABEL: Record<SignerRole, string> = { TECHNICIAN: "Teknisi", CUSTOMER: "Pelanggan" };
const SIGNATURE_STATUS_LABEL: Record<SignatureStatus, string> = {
  SIGNED: "Ditandatangani",
  UNAVAILABLE: "Tidak tersedia",
  REFUSED: "Menolak",
};
const IMAGE_ACCEPT = "image/png,image/jpeg,application/pdf";

export default function CalibrationJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();

  const query = useCalibrationJob(params.id);
  const corrections = useIdentityCorrections(params.id);
  const escalateMutation = useEscalateIdentity();
  const decideMutation = useDecideIdentity();
  const submitCorrection = useSubmitIdentityCorrection();
  const decideCorrection = useDecideIdentityCorrection();
  const uploadSignature = useUploadIdentityCorrectionSignature();

  const [dialog, setDialog] = useState<
    "escalate" | "approve" | "reject" | "submit-correction" | null
  >(null);
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

  async function handleSubmitCorrection(form: SubmitCorrectionForm) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    try {
      const input: IdentityCorrectionSubmitInput = {
        reason: form.reason.trim(),
        ...(form.attrs.device ? { newDeviceId: form.deviceId } : {}),
        ...(form.attrs.serial ? { newSerial: form.serial.trim() } : {}),
        ...(form.attrs.akdAkl ? { newAkdAkl: form.akdAkl.trim() } : {}),
        signatures: {
          TECHNICIAN: toSignatureInput(form.signatures.TECHNICIAN),
          CUSTOMER: toSignatureInput(form.signatures.CUSTOMER),
        },
      };
      const res = await submitCorrection.mutateAsync({ jobId: job.id, input });

      const failedUploads: string[] = [];
      for (const role of SIGNER_ROLES) {
        const sig = form.signatures[role];
        if (sig.status !== "SIGNED" || !sig.file) continue;
        const row = res.correction.signatures.find((s) => s.signerRole === role);
        if (!row) continue;
        try {
          await uploadSignature.mutateAsync({ jobId: job.id, signatureId: row.id, file: sig.file });
        } catch {
          failedUploads.push(SIGNER_LABEL[role]);
        }
      }

      setDialog(null);
      setSuccess(
        `BA ${res.correction.number} dibuat.` +
          (failedUploads.length
            ? ` Gambar tanda tangan ${failedUploads.join(" dan ")} gagal diunggah — unggah ulang di detail BA.`
            : ""),
      );
      await Promise.all([query.refetch(), corrections.refetch()]);
    } catch (err) {
      setError(formatCalibrationJobApiError(err, "Gagal mengajukan koreksi identitas."));
    }
  }

  async function handleDecideCorrection(
    correction: IdentityCorrection,
    decision: "APPROVE" | "REJECT",
    note?: string,
  ) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    try {
      await decideCorrection.mutateAsync({
        jobId: job.id,
        correctionId: correction.id,
        input: { decision, ...(note ? { decisionNote: note } : {}) },
      });
      setSuccess(decision === "APPROVE" ? "BA koreksi disetujui." : "BA koreksi ditolak.");
      await Promise.all([query.refetch(), corrections.refetch()]);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.data?.code === "IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING"
      ) {
        setError(missingSignatureImageMessage(err.data.signatureIds, correction.signatures));
      } else {
        setError(formatCalibrationJobApiError(err, "Gagal memproses keputusan BA."));
      }
    }
  }

  async function handleUploadSignatureImage(signatureId: string, file: File) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    try {
      await uploadSignature.mutateAsync({ jobId: job.id, signatureId, file });
      setSuccess("Gambar tanda tangan diunggah.");
      await corrections.refetch();
    } catch (err) {
      setError(formatCalibrationJobApiError(err, "Gagal mengunggah gambar tanda tangan."));
    }
  }

  const deviceType = resolvedDeviceType(job);
  const gateLocked = isIdentityGateLocked(job);
  const showEscalate =
    canEscalateIdentity(job) && Boolean(capabilities?.calibrationJobEscalateIdentity);
  const showDecide = canDecideIdentity(job) && Boolean(capabilities?.calibrationJobApproveIdentity);
  const canSubmitCorrection =
    canSubmitIdentityCorrection(job) &&
    Boolean(capabilities?.calibrationJobSubmitIdentityCorrection);
  const canDecideCorrection = Boolean(capabilities?.calibrationJobDecideIdentityCorrection);
  const correctionRows = corrections.data ?? [];
  const hasPendingCorrection = correctionRows.some((c) => c.status === "PENDING_REVIEW");
  const gateReopenedBy = correctionRows.find(
    (c) => c.status === "APPROVED" && c.akdAklGateReopened,
  );

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
            koreksi identitas tidak lagi tersedia.
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
              Belum ada device yang di-assign. Identitas fisik dikonfirmasi lewat Berita Acara
              Koreksi Identitas di bawah.
            </p>
          )}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Identity Corrections (Berita Acara)
            </h3>
            {canSubmitCorrection ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={hasPendingCorrection}
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  setDialog("submit-correction");
                }}
              >
                Ajukan Koreksi Identitas
              </Button>
            ) : null}
          </div>
          {hasPendingCorrection && canSubmitCorrection ? (
            <p className="mt-1 text-xs text-amber-600">
              Sudah ada BA yang menunggu review — selesaikan dulu sebelum mengajukan yang baru.
            </p>
          ) : null}

          {corrections.isLoading ? (
            <p className="mt-3 text-sm text-slate-400">Memuat…</p>
          ) : corrections.isError ? (
            <p className="mt-3 text-sm text-red-600">Gagal memuat daftar koreksi identitas.</p>
          ) : correctionRows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Belum ada koreksi identitas untuk job ini.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {correctionRows.map((correction) => (
                <CorrectionCard
                  key={correction.id}
                  correction={correction}
                  canDecide={canDecideCorrection}
                  canUpload={canSubmitCorrection}
                  uploadPending={uploadSignature.isPending}
                  decidePending={decideCorrection.isPending}
                  onDecide={handleDecideCorrection}
                  onUploadImage={handleUploadSignatureImage}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">AKD/AKL/NIE Approval</h3>
          <dl className="mt-3 space-y-4 text-sm">
            <DetailField label="Status">
              <AkdAklStatusBadge status={job.akdAklApprovalStatus} />
            </DetailField>
            {gateReopenedBy ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Gate dibuka kembali ke PENDING_REVIEW oleh BA {gateReopenedBy.number}.
              </p>
            ) : null}
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
        loading={decideMutation.isPending}
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
        title="Reject AKD/AKL/NIE"
        description="Job ini tidak dapat dilanjutkan ke kalibrasi. Catatan wajib diisi."
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

      <SubmitCorrectionDialog
        open={dialog === "submit-correction"}
        job={job}
        pending={submitCorrection.isPending || uploadSignature.isPending}
        onCancel={() => setDialog(null)}
        onSubmit={handleSubmitCorrection}
      />
    </div>
  );
}

// ── Identity correction card (list row + inline detail) ───────────────────────

function CorrectionCard({
  correction,
  canDecide,
  canUpload,
  uploadPending,
  decidePending,
  onDecide,
  onUploadImage,
}: {
  correction: IdentityCorrection;
  canDecide: boolean;
  canUpload: boolean;
  uploadPending: boolean;
  decidePending: boolean;
  onDecide: (
    correction: IdentityCorrection,
    decision: "APPROVE" | "REJECT",
    note?: string,
  ) => void | Promise<void>;
  onUploadImage: (signatureId: string, file: File) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const changes = summarizeCorrectionChanges(correction);
  const missing = signersMissingImage(correction.signatures);
  const isPending = correction.status === "PENDING_REVIEW";

  return (
    <li className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left"
      >
        <span className="font-mono text-sm font-medium text-slate-800">{correction.number}</span>
        <IdentityCorrectionStatusBadge status={correction.status} />
        <span className="text-xs text-slate-500">
          {changes.length
            ? changes.map((c) => c.attr).join(", ")
            : "—"}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          {SIGNER_ROLES.map((role) => {
            const sig = correction.signatures.find((s) => s.signerRole === role);
            return (
              <span key={role} title={`${SIGNER_LABEL[role]}: ${sig ? SIGNATURE_STATUS_LABEL[sig.status] : "—"}`}>
                {SIGNER_LABEL[role][0]}
                {sig?.status === "SIGNED" ? "✓" : sig?.status === "REFUSED" ? "✕" : "–"}
              </span>
            );
          })}
          <span>{formatDateTime(correction.createdAt)}</span>
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-3 py-3 text-sm">
          <DetailField label="Alasan">
            <span className="whitespace-pre-wrap">{correction.reason}</span>
          </DetailField>

          {changes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-xs">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 pr-3 font-medium">Atribut</th>
                    <th className="py-1 pr-3 font-medium">Sebelum</th>
                    <th className="py-1 font-medium">Sesudah</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((row) => (
                    <tr key={row.attr} className="border-t border-slate-200">
                      <td className="py-1 pr-3 text-slate-600">{row.attr}</td>
                      <td className="py-1 pr-3 font-mono text-slate-500">{row.prev}</td>
                      <td className="py-1 font-mono text-slate-800">{row.next}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {SIGNER_ROLES.map((role) => {
              const sig = correction.signatures.find((s) => s.signerRole === role);
              if (!sig) return null;
              return (
                <SignatureBlock
                  key={role}
                  signature={sig}
                  editable={isPending && canUpload}
                  uploadPending={uploadPending}
                  onUploadImage={onUploadImage}
                />
              );
            })}
          </div>

          {correction.status !== "PENDING_REVIEW" ? (
            <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
              <DetailField label="Diputuskan oleh">
                {correction.decidedBy?.name ?? "—"}
              </DetailField>
              <DetailField label="Diputuskan pada">
                {formatDateTime(correction.decidedAt)}
              </DetailField>
              <DetailField label="Catatan keputusan">
                {correction.decisionNote ? (
                  <span className="whitespace-pre-wrap">{correction.decisionNote}</span>
                ) : (
                  "—"
                )}
              </DetailField>
            </div>
          ) : null}

          {correction.akdAklGateReopened ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Koreksi ini membuka kembali gate AKD/AKL job ke PENDING_REVIEW.
            </p>
          ) : null}

          {isPending && canDecide ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
              {missing.length ? (
                <p className="mr-auto text-xs text-amber-600">
                  Gambar tanda tangan {missing.join(" dan ")} belum diunggah.
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={decidePending}
                onClick={() => onDecide(correction, "APPROVE")}
              >
                <Check className="h-3.5 w-3.5" /> Setujui
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={decidePending}
                onClick={() => setRejectOpen(true)}
              >
                <X className="h-3.5 w-3.5" /> Tolak
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <RejectDialog
        open={rejectOpen}
        pending={decidePending}
        title={`Tolak BA ${correction.number}`}
        description="BA ditolak — tidak ada perubahan yang ditulis ke job. Catatan wajib diisi."
        onCancel={() => setRejectOpen(false)}
        onSubmit={async (note) => {
          await onDecide(correction, "REJECT", note);
          setRejectOpen(false);
        }}
      />
    </li>
  );
}

function SignatureBlock({
  signature,
  editable,
  uploadPending,
  onUploadImage,
}: {
  signature: IdentityCorrectionSignature;
  editable: boolean;
  uploadPending: boolean;
  onUploadImage: (signatureId: string, file: File) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const roleLabel = SIGNER_LABEL[signature.signerRole];
  const image = signature.files.find((f) => (f.mimeType ?? "").startsWith("image/"));
  const pdf = signature.files.find((f) => (f.mimeType ?? "") === "application/pdf");

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{roleLabel}</p>
      <p className="mt-1 text-sm text-slate-700">
        {SIGNATURE_STATUS_LABEL[signature.status]}
        {signature.signerName ? ` · ${signature.signerName}` : ""}
      </p>
      {signature.status !== "SIGNED" && signature.unavailableReason ? (
        <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">
          {signature.unavailableReason}
        </p>
      ) : null}

      {image ? (
        <div className="mt-2">
          <SignatureImage fileId={image.id} alt={`Tanda tangan ${roleLabel}`} />
        </div>
      ) : pdf ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <FileText className="h-3.5 w-3.5" /> {pdf.originalName ?? "Lampiran PDF"}
        </p>
      ) : signature.status === "SIGNED" ? (
        <p className="mt-2 text-xs text-amber-600">Gambar tanda tangan belum diunggah.</p>
      ) : null}

      {editable && signature.status === "SIGNED" && signature.files.length === 0 ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onUploadImage(signature.id, file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={uploadPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploadPending ? "Mengunggah…" : "Unggah gambar tanda tangan"}
          </Button>
        </>
      ) : null}
    </div>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

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
  title,
  description,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!open) return null;

  return (
    <DialogShell title={title} onCancel={onCancel} pending={pending}>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
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

// ── Submit correction dialog ─────────────────────────────────────────────────

interface SignatureFormValue {
  status: SignatureStatus;
  signerName: string;
  unavailableReason: string;
  file: File | null;
}

interface SubmitCorrectionForm {
  reason: string;
  attrs: { device: boolean; serial: boolean; akdAkl: boolean };
  deviceId: string;
  serial: string;
  akdAkl: string;
  signatures: Record<SignerRole, SignatureFormValue>;
}

function emptySignature(): SignatureFormValue {
  return { status: "SIGNED", signerName: "", unavailableReason: "", file: null };
}

function toSignatureInput(v: SignatureFormValue) {
  return {
    status: v.status,
    ...(v.status === "SIGNED" ? { signerName: v.signerName.trim() } : {}),
    ...(v.status !== "SIGNED" ? { unavailableReason: v.unavailableReason.trim() } : {}),
  };
}

function signatureBlockValid(v: SignatureFormValue): boolean {
  if (v.status === "SIGNED") return v.signerName.trim().length > 0;
  return v.unavailableReason.trim().length > 0;
}

function SubmitCorrectionDialog({
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
  onSubmit: (form: SubmitCorrectionForm) => void;
}) {
  const [reason, setReason] = useState("");
  const [attrs, setAttrs] = useState({ device: false, serial: false, akdAkl: false });
  const [deviceId, setDeviceId] = useState("");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [serial, setSerial] = useState("");
  const [akdAkl, setAkdAkl] = useState("");
  const [signatures, setSignatures] = useState<Record<SignerRole, SignatureFormValue>>({
    TECHNICIAN: emptySignature(),
    CUSTOMER: emptySignature(),
  });

  useEffect(() => {
    if (open) {
      setReason("");
      setAttrs({ device: false, serial: false, akdAkl: false });
      setDeviceId("");
      setDeviceSearch("");
      setSerial(job.technicianObservedSerial ?? "");
      setAkdAkl(job.technicianObservedAkdAkl ?? "");
      setSignatures({ TECHNICIAN: emptySignature(), CUSTOMER: emptySignature() });
    }
  }, [open, job.technicianObservedSerial, job.technicianObservedAkdAkl]);

  const debouncedSearch = useDebouncedValue(deviceSearch, 400);
  const candidatesQuery = useDeviceCandidates(job.id, debouncedSearch, open && attrs.device);
  const candidates = candidatesQuery.data ?? [];

  if (!open) return null;

  const anyAttr = attrs.device || attrs.serial || attrs.akdAkl;
  const attrsValid =
    (!attrs.device || deviceId.length > 0) &&
    (!attrs.serial || serial.trim().length > 0) &&
    (!attrs.akdAkl || akdAkl.trim().length > 0);
  const signaturesValid =
    signatureBlockValid(signatures.TECHNICIAN) && signatureBlockValid(signatures.CUSTOMER);
  const canConfirm = reason.trim().length > 0 && anyAttr && attrsValid && signaturesValid;

  function setSig(role: SignerRole, patch: Partial<SignatureFormValue>) {
    setSignatures((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }

  return (
    <DialogShell title="Ajukan Koreksi Identitas" onCancel={onCancel} pending={pending} wide>
      <div className="mt-4 max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <label className="block text-sm font-medium text-slate-700">
          Alasan koreksi *
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={2000}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700">Atribut yang dikoreksi *</legend>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attrs.device}
              onChange={(e) => setAttrs((p) => ({ ...p, device: e.target.checked }))}
            />
            Device
          </label>
          {attrs.device ? (
            <div className="ml-6 space-y-2">
              <Input
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                placeholder="Cari serial / brand / model…"
              />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {candidatesQuery.isLoading ? (
                  <p className="text-sm text-slate-400">Memuat…</p>
                ) : candidatesQuery.isError ? (
                  <p className="text-sm text-red-600">Gagal memuat kandidat device.</p>
                ) : candidates.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Tidak ada device yang cocok. Device harus didaftarkan lebih dulu oleh
                    admin/kantor.
                  </p>
                ) : (
                  candidates.map((device: CalibrationJobDeviceCandidate) => (
                    <label
                      key={device.id}
                      className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="correction-device"
                        checked={deviceId === device.id}
                        onChange={() => setDeviceId(device.id)}
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
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attrs.serial}
              onChange={(e) => setAttrs((p) => ({ ...p, serial: e.target.checked }))}
            />
            Serial (observed)
          </label>
          {attrs.serial ? (
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              maxLength={120}
              className="ml-6 w-[calc(100%-1.5rem)]"
              placeholder="Serial yang benar"
            />
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attrs.akdAkl}
              onChange={(e) => setAttrs((p) => ({ ...p, akdAkl: e.target.checked }))}
            />
            AKD/AKL/NIE
          </label>
          {attrs.akdAkl ? (
            <Input
              value={akdAkl}
              onChange={(e) => setAkdAkl(e.target.value)}
              maxLength={120}
              className="ml-6 w-[calc(100%-1.5rem)]"
              placeholder="AKD/AKL/NIE yang benar"
            />
          ) : null}
        </fieldset>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700">Tanda tangan</p>
          {SIGNER_ROLES.map((role) => {
            const sig = signatures[role];
            return (
              <div key={role} className="rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {SIGNER_LABEL[role]}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(["SIGNED", "UNAVAILABLE", "REFUSED"] as SignatureStatus[]).map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input
                        type="radio"
                        name={`sig-${role}`}
                        checked={sig.status === s}
                        onChange={() => setSig(role, { status: s })}
                      />
                      {SIGNATURE_STATUS_LABEL[s]}
                    </label>
                  ))}
                </div>
                {sig.status === "SIGNED" ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={sig.signerName}
                      onChange={(e) => setSig(role, { signerName: e.target.value })}
                      maxLength={120}
                      placeholder="Nama penandatangan"
                    />
                    <input
                      type="file"
                      accept={IMAGE_ACCEPT}
                      onChange={(e) => setSig(role, { file: e.target.files?.[0] ?? null })}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm"
                    />
                    {sig.file ? (
                      <p className="text-xs text-slate-500">{sig.file.name}</p>
                    ) : (
                      <p className="text-xs text-amber-600">
                        Tanpa gambar sekarang, BA tetap dibuat — unggah nanti di detail sebelum
                        disetujui.
                      </p>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={sig.unavailableReason}
                    onChange={(e) => setSig(role, { unavailableReason: e.target.value })}
                    rows={2}
                    maxLength={500}
                    placeholder="Alasan (mis. pelanggan tidak di tempat)"
                    className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <DialogActions
        pending={pending}
        confirmLabel="Ajukan BA"
        disabled={!canConfirm}
        onCancel={onCancel}
        onConfirm={() =>
          onSubmit({ reason, attrs, deviceId, serial, akdAkl, signatures })
        }
      />
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
