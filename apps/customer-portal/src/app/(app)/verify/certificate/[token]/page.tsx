"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@medcal/shared";
import {
  formatDate,
  isPlausibleToken,
  presentStatus,
  type CertificateVerification,
} from "../../../../../lib/certificate-verification";
import { CertificatePdfViewer } from "../../../../../components/certificate-pdf-viewer";
import { ErrorState, LoadingState } from "../../../../../components/status-blocks";
import { customerQueryKey } from "../../../../../lib/customer-query";
import { useSessionUserId } from "../../../../../lib/session";

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
  const userId = useSessionUserId();

  const query = useQuery({
    queryKey: customerQueryKey(userId, "certificate-verification", token),
    queryFn: () => apiFetch<CertificateVerification>(`/certificate-verification/${encodeURIComponent(token)}`),
    enabled: plausible && Boolean(userId),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {!plausible ? (
        <NotFound />
      ) : query.isLoading ? (
        <LoadingState label="Memeriksa sertifikat…" />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? (
          <NotFound />
        ) : (
          <ErrorState
            message="Sertifikat belum bisa dimuat. Coba lagi dalam beberapa saat."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
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
                  <dt className="text-slate-600">Nomor sertifikat</dt>
                  <dd className="break-all font-mono text-base text-slate-900">{cert.number}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Pelanggan</dt>
                  <dd className="text-slate-900">{cert.customerName}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Alat</dt>
                  <dd className="text-slate-900">{device}</dd>
                </div>
                <div className="flex gap-8">
                  <div>
                    <dt className="text-slate-600">Tanggal terbit</dt>
                    <dd className="text-slate-900">{formatDate(cert.issuedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">Berlaku sampai</dt>
                    <dd className="text-slate-900">{formatDate(cert.validUntil)}</dd>
                  </div>
                </div>
              </dl>

              {cert.pdfAvailable ? (
                <CertificatePdfViewer token={token} />
              ) : (
                <p className="text-sm text-slate-600">PDF sertifikat tidak tersedia untuk status ini.</p>
              )}
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
