"use client";

import { useParams } from "next/navigation";
import { Screen } from "../../../../../components/layout/screen";
import { Section, SectionRow } from "../../../../../components/ui/section";
import { Badge } from "../../../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../../../../components/ui/state-views";
import { SignatureImage } from "../../../../../components/ui/signature-image";
import { formatApiError } from "../../../../../lib/api-errors";
import { IDENTITY_CORRECTION_STATUS_LABELS } from "../../../../../lib/calibration/types";
import type { TechIdentityCorrection, IdentityCorrectionSignerRole, SignatureStatus } from "../../../../../lib/calibration/types";
import { summarizeCorrectionChanges } from "../../../../../lib/calibration/job-display";
import { useCorrectionQuery } from "../../use-job-query";

const CORRECTION_BADGE_CLASS: Record<TechIdentityCorrection["status"], string> = {
  PENDING_REVIEW: "bg-amber-500",
  APPROVED: "bg-emerald-600",
  REJECTED: "bg-red-600",
};

const SIGNER_LABELS: Record<IdentityCorrectionSignerRole, string> = {
  TECHNICIAN: "Teknisi",
  CUSTOMER: "Pelanggan",
};

const SIGNATURE_STATUS_LABELS: Record<SignatureStatus, string> = {
  SIGNED: "Ditandatangani",
  UNAVAILABLE: "Tidak Tersedia",
  REFUSED: "Menolak",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CorrectionDetailPage() {
  const params = useParams<{ id: string; correctionId: string }>();
  const { id: jobId, correctionId } = params;

  const query = useCorrectionQuery(jobId, correctionId);

  if (query.isPending) {
    return (
      <Screen title="Detail Koreksi" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen title="Detail Koreksi" showBack>
        <ErrorState
          message={formatApiError(query.error, "Gagal memuat koreksi identitas.")}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const correction = query.correction;
  if (!correction) {
    return (
      <Screen title="Detail Koreksi" showBack>
        <EmptyState title="Koreksi identitas tidak ditemukan." />
      </Screen>
    );
  }

  const rows = summarizeCorrectionChanges(correction);

  return (
    <Screen title={correction.number} showBack>
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <Badge className={["rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", CORRECTION_BADGE_CLASS[correction.status]].join(" ")}>
          {IDENTITY_CORRECTION_STATUS_LABELS[correction.status]}
        </Badge>
        <p className="mt-1 text-xs text-slate-500">{formatDate(correction.createdAt)}</p>
      </div>

      <Section title="Alasan">
        <p className="text-sm text-slate-700">{correction.reason || "—"}</p>
      </Section>

      <Section title="Perubahan">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada perubahan atribut.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.attr} className="text-sm">
                <p className="text-xs text-slate-500">{row.attr}</p>
                <p className="text-slate-900">
                  {row.prev} <span className="text-slate-400">→</span> {row.next}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Tanda Tangan">
        <div className="flex flex-col gap-4">
          {correction.signatures.map((sig) => (
            <div key={sig.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900">{SIGNER_LABELS[sig.signerRole]}</span>
                <span className="text-xs text-slate-500">{SIGNATURE_STATUS_LABELS[sig.status]}</span>
              </div>
              {sig.signerName ? <p className="text-xs text-slate-500">{sig.signerName}</p> : null}
              {sig.unavailableReason ? (
                <p className="text-xs text-slate-500">Alasan: {sig.unavailableReason}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Foto BA">
        {(() => {
          const image = correction.files.find((f) => (f.mimeType ?? "").startsWith("image/"));
          const pdf = correction.files.find((f) => (f.mimeType ?? "") === "application/pdf");
          const anySigned = correction.signatures.some((s) => s.status === "SIGNED");

          if (image) {
            return (
              <div>
                <SignatureImage fileId={image.id} alt="Foto BA (lembar tanda tangan)" />
              </div>
            );
          }
          if (pdf) {
            return <p className="text-sm text-slate-600">{pdf.originalName ?? "Lampiran PDF"}</p>;
          }
          if (anySigned) {
            return <p className="text-sm text-amber-600">Foto BA belum diunggah.</p>;
          }
          return (
            <p className="text-sm text-slate-500">Tidak ada tanda tangan — foto tidak diperlukan.</p>
          );
        })()}
      </Section>

      {correction.decidedAt ? (
        <Section title="Keputusan">
          <SectionRow label="Diputuskan oleh" value={correction.decidedBy?.name ?? "—"} />
          <SectionRow label="Tanggal" value={formatDate(correction.decidedAt)} />
          {correction.decisionNote ? (
            <p className="mt-1 text-sm text-slate-600">{correction.decisionNote}</p>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}
