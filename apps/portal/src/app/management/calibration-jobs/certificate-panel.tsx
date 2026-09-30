"use client";

import { useRef, useState } from "react";
import { Download, FileText, QrCode, Trash2, Upload } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "./calibration-jobs-ui";
import { ConfirmDialog } from "../calibration-requests/calibration-requests-ui";
import {
  downloadCertificateVersion,
  fetchCertificateQrObjectUrl,
  useCertificate,
  useDeleteCertificateVersion,
  useIssueGeneratedCertificate,
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
    if (code === "CERTIFICATE_NUMBER_REQUIRED")
      return "Nomor sertifikat wajib diisi — isi sesuai nomor yang tercetak pada sertifikat.";
    if (code === "CERTIFICATE_NUMBER_RESERVED")
      return 'Nomor yang diawali "CRT/" dicadangkan untuk sertifikat yang diterbitkan Medcal. Gunakan nomor asli pada sertifikat eksternal.';
    if (code === "CERTIFICATE_NUMBER_INVALID")
      return "Nomor sertifikat hanya boleh berisi huruf, angka, spasi dan . _ / - dan harus diawali huruf/angka.";
    if (code === "CERTIFICATE_NUMBER_TOO_LONG") return "Nomor sertifikat terlalu panjang (maks. 64 karakter).";
    if (code === "CERTIFICATE_NUMBER_DUPLICATE")
      return "Nomor sertifikat ini sudah dipakai sertifikat lain di perusahaan ini.";
    if (code === "CERTIFICATE_NUMBER_IMMUTABLE") return "Nomor sertifikat yang sudah terbit tidak dapat diubah.";
    if (code === "CERTIFICATE_GENERATED_IMMUTABLE")
      return "Sertifikat ini diterbitkan oleh Medcal; PDF-nya tidak dapat diganti melalui unggahan.";
    if (code === "CERTIFICATE_JOB_NOT_ACCEPTED")
      return "Sertifikat hanya dapat diterbitkan untuk job yang sudah diterima QA.";
    if (code === "CERTIFICATE_ALREADY_EXISTS") return "Job ini sudah memiliki sertifikat.";
    if (code === "CERTIFICATE_LEGACY_DRAFT_EXISTS")
      return "Job ini memiliki catatan sertifikat lama (DRAFT) dengan nomor historis. Unggahan tidak mengubahnya; koreksi data lama memerlukan proses terpisah.";
    if (code === "CERTIFICATE_NUMBER_SEQUENCE_EXHAUSTED")
      return "Nomor urut sertifikat tahun ini sudah habis. Hubungi administrator.";
    if (code === "CERTIFICATE_PDF_GENERATION_FAILED")
      return "Sertifikat sudah terbit, tetapi PDF gagal dibuat. Tekan tombol lagi untuk membuat ulang PDF.";
    if (code === "CERTIFICATE_DUPLICATE_FILE")
      return "File ini identik dengan versi sertifikat yang sedang aktif — tidak ada versi baru yang dibuat.";
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
 * Suggests a number from the file name — a convenience only. The user must
 * confirm it and the server never parses it.
 */
function suggestNumberFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, "").trim();
}

/** Shows the QR of the verification URL — the customer scans it to open the certificate in Medcal. */
function QrSection({ jobId, verificationUrl }: { jobId: string; verificationUrl: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function show() {
    setErr(null);
    setLoading(true);
    try {
      if (src) URL.revokeObjectURL(src);
      setSrc(await fetchCertificateQrObjectUrl(jobId));
    } catch (e) {
      setErr(apiErr(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <Button type="button" variant="outline" size="sm" disabled={loading || !verificationUrl} onClick={show}>
        <QrCode className="h-3.5 w-3.5" />
        {loading ? "Memuat…" : "Tampilkan QR verifikasi"}
      </Button>
      {!verificationUrl ? (
        <p className="text-xs text-slate-400">URL verifikasi belum tersedia (portal customer belum dikonfigurasi).</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {src ? (
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="QR verifikasi sertifikat" className="h-40 w-40 rounded border border-slate-200" />
          {verificationUrl ? <p className="break-all text-xs text-slate-500">{verificationUrl}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Certificate section for the Calibration Job detail page.
 *
 * - UPLOADED (external certificate): the user picks the PDF AND confirms the
 *   certificate number printed on it (pre-filled from the filename as a
 *   convenience only). The upload establishes the certificate as ISSUED.
 * - GENERATED: issued by Medcal via "Terbitkan sertifikat" (allocates the CRT
 *   number); never replaced by an upload.
 * Upload stays gated on RBAC only, never on QA status; issue is gated on the
 * `certificate:issue` capability and a QA-accepted job.
 */
export function CertificatePanel({
  jobId,
  qaApproved,
  canRead,
  canUpload,
  canDelete,
  canIssue,
  jobAccepted,
}: {
  jobId: string;
  qaApproved: boolean;
  canRead: boolean;
  canUpload: boolean;
  canDelete: boolean;
  canIssue: boolean;
  jobAccepted: boolean;
}) {
  const query = useCertificate(jobId, canRead);
  const upload = useUploadCertificate(jobId);
  const issue = useIssueGeneratedCertificate(jobId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [numberInput, setNumberInput] = useState("");

  if (!canRead) return null;

  const certificate = query.data ?? null;
  const versions = certificate?.versions ?? [];
  const isGenerated = certificate?.source === "GENERATED";
  // The number is entered only when the certificate is first established; an
  // already ISSUED certificate keeps its immutable number. A legacy DRAFT
  // record is never changed by an upload (see legacyDraft below).
  const needsNumber = !certificate;
  const legacyDraft = certificate?.status === "DRAFT";
  const isReplace = versions.length > 0;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPendingFile(file);
    setNumberInput(needsNumber ? suggestNumberFromFilename(file.name) : "");
  }

  async function submitUpload() {
    if (!pendingFile) return;
    setError(null);
    try {
      await upload.mutateAsync({
        file: pendingFile,
        ...(needsNumber ? { certificateNumber: numberInput } : {}),
      });
      setPendingFile(null);
      setNumberInput("");
    } catch (err) {
      setError(apiErr(err));
    }
  }

  async function onIssue() {
    setError(null);
    try {
      await issue.mutateAsync();
    } catch (err) {
      setError(apiErr(err));
    }
  }

  const uploadInput = (
    <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPick} />
  );

  const uploadForm = pendingFile ? (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-sm text-slate-600">
        File: <span className="font-mono">{pendingFile.name}</span>
      </p>
      {needsNumber ? (
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="certificate-number">
            Nomor Sertifikat
          </label>
          <Input
            id="certificate-number"
            value={numberInput}
            maxLength={64}
            placeholder="mis. PKM-CERT-2026-00123"
            onChange={(ev) => setNumberInput(ev.target.value)}
          />
          <p className="text-xs text-slate-500">
            Isi dengan nomor yang tercetak pada sertifikat. Nama file hanya saran — pastikan nomor di atas benar
            sebelum melanjutkan.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Nomor sertifikat <span className="font-mono">{certificate?.number}</span> tidak berubah; hanya PDF yang
          diganti.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={upload.isPending || (needsNumber && numberInput.trim() === "")}
          onClick={submitUpload}
        >
          <Upload className="h-3.5 w-3.5" />
          {upload.isPending ? "Mengunggah…" : "Unggah"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={upload.isPending} onClick={() => setPendingFile(null)}>
          Batal
        </Button>
      </div>
    </div>
  ) : null;

  const qaNotice = !qaApproved ? (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
      QA review belum approved. Certificate tetap dapat di-upload.
    </p>
  ) : null;

  const issueButton =
    canIssue && !certificate ? (
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" disabled={issue.isPending || !jobAccepted} onClick={onIssue}>
          {issue.isPending ? "Menerbitkan…" : "Terbitkan sertifikat (Medcal)"}
        </Button>
        {!jobAccepted ? <p className="text-xs text-slate-400">Tersedia setelah job diterima QA.</p> : null}
      </div>
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
            <Badge variant="secondary" className="text-[10px]">
              {isGenerated ? "Diterbitkan Medcal" : "Sertifikat eksternal"}
            </Badge>
          </div>
          {legacyDraft ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Ini adalah catatan sertifikat lama (DRAFT) dengan nomor historis {certificate.number}. Nomor ini tidak
              diubah oleh unggahan; koreksi data lama akan ditangani melalui proses terpisah.
            </p>
          ) : null}
          {isGenerated && versions.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sertifikat sudah terbit tetapi PDF belum berhasil dibuat.
              {canIssue ? " Tekan tombol di bawah untuk membuat ulang." : ""}
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {versions.length > 0 ? (
            <ul className="space-y-1">
              {versions.map((v) => (
                <VersionRow key={v.id} jobId={jobId} version={v} canDelete={canDelete} onError={setError} />
              ))}
            </ul>
          ) : null}

          {isGenerated && versions.length === 0 && canIssue ? (
            <Button type="button" variant="outline" size="sm" disabled={issue.isPending} onClick={onIssue}>
              {issue.isPending ? "Membuat PDF…" : "Buat ulang PDF"}
            </Button>
          ) : null}

          {canUpload && !isGenerated && !legacyDraft ? (
            <>
              {uploadInput}
              {uploadForm}
              {!pendingFile ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={upload.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isReplace ? "Ganti sertifikat (unggah versi baru)" : "Unggah sertifikat PDF"}
                </Button>
              ) : null}
            </>
          ) : null}

          {!legacyDraft ? (
            <QrSection jobId={jobId} verificationUrl={certificate.verificationUrl} />
          ) : null}
        </>
      ) : (
        // No certificate yet — a normal empty state, not an error. Upload
        // stays gated on RBAC (canUpload) only, never on QA status.
        <>
          {canUpload ? (
            <>
              {uploadInput}
              {uploadForm}
              {!pendingFile ? (
                <Button type="button" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Upload Sertifikat
                </Button>
              ) : null}
            </>
          ) : null}

          {issueButton}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <p className="text-sm text-slate-500">Belum ada sertifikat untuk job ini.</p>

          {qaNotice}
        </>
      )}
    </div>
  );
}
