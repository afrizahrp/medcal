"use client";

import { useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "./calibration-jobs-ui";
import { ConfirmDialog } from "../calibration-requests/calibration-requests-ui";
import {
  downloadCertificateVersion,
  useCertificate,
  useDeleteCertificateVersion,
  useUploadCertificate,
  type CertificateVersion,
} from "./use-certificate-query";

function apiErr(e: unknown): string {
  if (e instanceof ApiError) {
    const code = e.data?.code;
    if (code === "CERTIFICATE_DEVICE_NOT_RESOLVED")
      return "Identitas device pada job ini belum ditentukan — sertifikat belum dapat dilampirkan.";
    if (code === "FILE_MIME_NOT_ALLOWED" || code === "FILE_EXTENSION_NOT_ALLOWED" || code === "FILE_CONTENT_MISMATCH")
      return "Hanya file PDF (hasil scan sertifikat) yang diperbolehkan.";
    if (code === "FILE_TOO_LARGE") return "Ukuran file melebihi batas (10 MB).";
    if (code === "CERTIFICATE_CURRENT_VERSION_LOCKED" || code === "FILE_STILL_REFERENCED")
      return "Versi ini adalah versi aktif saat ini — unggah versi baru terlebih dahulu sebelum menghapusnya.";
    if (code === "CERTIFICATE_FILE_NOT_FOUND") return "File tidak ditemukan untuk sertifikat ini.";
    if (typeof e.data?.message === "string") return e.data.message;
    return e.message;
  }
  return "Terjadi kesalahan. Coba lagi.";
}

function VersionRow({
  jobId,
  version,
  canDelete,
  onError,
}: {
  jobId: string;
  version: CertificateVersion;
  canDelete: boolean;
  onError: (m: string | null) => void;
}) {
  const removeVersion = useDeleteCertificateVersion(jobId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function download() {
    onError(null);
    try {
      await downloadCertificateVersion(jobId, version);
    } catch (err) {
      onError(apiErr(err));
    }
  }

  async function remove() {
    onError(null);
    try {
      await removeVersion.mutateAsync(version.id);
      setConfirmOpen(false);
    } catch (err) {
      onError(apiErr(err));
      setConfirmOpen(false);
    }
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="truncate">{version.originalName ?? version.id}</span>
      {version.isCurrent ? (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
          Versi aktif
        </Badge>
      ) : (
        <span className="text-xs text-slate-400">riwayat</span>
      )}
      {version.sizeBytes ? (
        <span className="text-xs text-slate-400">({Math.ceil(version.sizeBytes / 1024)} KB)</span>
      ) : null}
      <span className="text-xs text-slate-400">{formatDateTime(version.createdAt)}</span>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={download}>
        <Download className="h-3.5 w-3.5" /> Unduh
      </Button>
      {canDelete ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600"
            disabled={removeVersion.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            title="Hapus Versi Sertifikat"
            description={
              version.isCurrent
                ? "Ini adalah versi aktif saat ini — unggah versi baru sebelum menghapusnya. Sistem akan menolak permintaan ini."
                : "Hapus versi sertifikat ini secara permanen? Tindakan ini tidak dapat dibatalkan."
            }
            confirmLabel="Hapus"
            variant="destructive"
            loading={removeVersion.isPending}
            onConfirm={remove}
            onCancel={() => setConfirmOpen(false)}
          />
        </>
      ) : null}
    </li>
  );
}

/**
 * Certificate section for the Calibration Job detail page. Deliberately never
 * hides the upload control based on QA/QualityReview status — only RBAC
 * (canUpload) gates it. When QA is not yet approved, this shows a
 * non-blocking informational note, never a disabled state.
 */
export function CertificatePanel({
  jobId,
  qaApproved,
  canRead,
  canUpload,
  canDelete,
}: {
  jobId: string;
  qaApproved: boolean;
  canRead: boolean;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const query = useCertificate(jobId, canRead);
  const upload = useUploadCertificate(jobId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canRead) return null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      setError(apiErr(err));
    }
  }

  const certificate = query.data ?? null;
  const versions = certificate?.versions ?? [];
  const isReplace = versions.length > 0;

  const uploadInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/pdf"
      className="hidden"
      onChange={onPick}
    />
  );

  const qaNotice = !qaApproved ? (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
      QA review belum approved. Certificate tetap dapat di-upload.
    </p>
  ) : null;

  return (
    <div className="space-y-3">
      {query.isLoading ? (
        <p className="text-sm text-slate-400">Memuat…</p>
      ) : query.isError ? (
        <p className="text-sm text-red-600">Gagal memuat data sertifikat.</p>
      ) : certificate ? (
        <>
          {qaNotice}
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-mono">{certificate.number}</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {certificate.status}
            </Badge>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {versions.length > 0 ? (
            <ul className="space-y-1">
              {versions.map((v) => (
                <VersionRow key={v.id} jobId={jobId} version={v} canDelete={canDelete} onError={setError} />
              ))}
            </ul>
          ) : null}

          {canUpload ? (
            <>
              {uploadInput}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={upload.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {upload.isPending ? "Mengunggah…" : isReplace ? "Ganti sertifikat (unggah versi baru)" : "Unggah sertifikat PDF (hasil scan)"}
              </Button>
            </>
          ) : null}
        </>
      ) : (
        // No certificate yet — a normal empty state, not an error. Upload
        // stays gated on RBAC (canUpload) only, never on QA status.
        <>
          {canUpload ? (
            <>
              {uploadInput}
              <Button
                type="button"
                disabled={upload.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {upload.isPending ? "Mengunggah…" : "Upload Sertifikat"}
              </Button>
            </>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <p className="text-sm text-slate-500">Belum ada sertifikat yang di-upload.</p>

          {qaNotice}
        </>
      )}
    </div>
  );
}
