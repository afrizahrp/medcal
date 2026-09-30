"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch, apiFetchBlob } from "@medcal/shared";
import {
  formatDate,
  isPlausibleToken,
  presentStatus,
  type CertificateVerification,
} from "../../../../../lib/certificate-verification";
import { openPdfFromGesture } from "../../../../../lib/open-pdf";

const TONE_CLASS = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-red-200 bg-red-50 text-red-900",
} as const;

function NotFound() {
  // One constant message for a malformed token, an unknown token and a
  // certificate that is not the signed-in customer's — no oracle.
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <h1 className="text-lg font-semibold text-slate-900">Sertifikat tidak ditemukan</h1>
      <p className="mt-1 text-sm text-slate-600">
        Kode QR tidak valid, atau sertifikat ini tidak tersedia untuk akun Anda.
      </p>
    </div>
  );
}

/**
 * QR landing page: /verify/certificate/<opaque token>. The token is only a
 * locator — the API decides whether THIS signed-in customer may see the
 * certificate. Shows the actual Certificate.number (external number for an
 * uploaded certificate, CRT/… for a generated one) and the stored PDF through
 * the same endpoint for both.
 */
export default function VerifyCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const plausible = isPlausibleToken(token);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const query = useQuery({
    queryKey: ["certificate-verification", token],
    queryFn: () => apiFetch<CertificateVerification>(`/certificate-verification/${encodeURIComponent(token)}`),
    enabled: plausible,
    retry: false,
  });

  // Runs inside the tap: openPdfFromGesture opens the window synchronously
  // (before the PDF is fetched) so mobile popup blockers allow it, and falls
  // back to navigating this tab if a window still cannot be opened.
  async function openPdf() {
    setPdfError(null);
    setOpening(true);
    try {
      await openPdfFromGesture({
        openWindow: () => window.open("", "_blank"),
        fetchBlob: () => apiFetchBlob(`/certificate-verification/${encodeURIComponent(token)}/pdf`),
        createObjectURL: (blob) => URL.createObjectURL(blob),
        navigateCurrent: (url) => window.location.assign(url),
      });
    } catch (err) {
      setPdfError(
        err instanceof ApiError && err.status === 404
          ? "PDF sertifikat tidak tersedia."
          : "Gagal membuka PDF. Coba lagi.",
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {!plausible ? (
        <NotFound />
      ) : query.isLoading ? (
        <p className="text-slate-500">Memeriksa sertifikat…</p>
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? (
          <NotFound />
        ) : (
          <p className="text-sm text-red-600">Gagal memuat sertifikat. Coba lagi nanti.</p>
        )
      ) : query.data ? (
        (() => {
          const cert = query.data;
          const status = presentStatus(cert.status);
          const device = [cert.device.name, cert.device.brand, cert.device.model].filter(Boolean).join(" · ");
          return (
            <div className="space-y-5">
              <div className={`rounded-md border p-4 ${TONE_CLASS[status.tone]}`}>
                <h1 className="text-lg font-semibold">{status.label}</h1>
                <p className="mt-1 text-sm">{status.message}</p>
              </div>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Nomor sertifikat</dt>
                  <dd className="break-all font-mono text-base text-slate-900">{cert.number}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Pelanggan</dt>
                  <dd className="text-slate-900">{cert.customerName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Alat</dt>
                  <dd className="text-slate-900">{device}</dd>
                </div>
                <div className="flex gap-8">
                  <div>
                    <dt className="text-slate-500">Tanggal terbit</dt>
                    <dd className="text-slate-900">{formatDate(cert.issuedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Berlaku sampai</dt>
                    <dd className="text-slate-900">{formatDate(cert.validUntil)}</dd>
                  </div>
                </div>
              </dl>

              {cert.pdfAvailable ? (
                <div>
                  <button
                    type="button"
                    onClick={openPdf}
                    disabled={opening}
                    className="rounded-md bg-brand-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {opening ? "Membuka…" : "Lihat sertifikat (PDF)"}
                  </button>
                  {pdfError ? <p className="mt-2 text-sm text-red-600">{pdfError}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">PDF sertifikat tidak tersedia untuk status ini.</p>
              )}
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
