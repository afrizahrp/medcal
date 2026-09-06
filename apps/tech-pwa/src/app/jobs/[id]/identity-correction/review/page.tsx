"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Screen } from "../../../../../components/layout/screen";
import { StickyActionBar } from "../../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../../components/ui/button";
import { Section, SectionRow } from "../../../../../components/ui/section";
import { ErrorBanner } from "../../../../../components/feedback/error-banner";
import { formatApiError } from "../../../../../lib/api-errors";
import type { IdentityCorrectionSubmitInput } from "../../../../../lib/calibration/types";
import { useSubmitIdentityCorrection, useUploadIdentityCorrectionPhoto } from "../../use-job-query";
import { useWizard } from "../layout";
import {
  photoStepValid,
  signatureValid,
  step1Valid,
  toSignatureInput,
} from "../wizard-state";

const SIGNATURE_STATUS_LABELS: Record<string, string> = {
  SIGNED: "Ditandatangani",
  UNAVAILABLE: "Tidak Tersedia",
  REFUSED: "Menolak",
};

function dash(v: string | null | undefined): string {
  return v && v.trim() ? v : "—";
}

export default function IdentityCorrectionReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { job, state } = useWizard();
  const submitCorrection = useSubmitIdentityCorrection(id);
  const uploadPhoto = useUploadIdentityCorrectionPhoto(id);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guardValid =
    step1Valid(state) &&
    signatureValid(state.signatures.TECHNICIAN) &&
    signatureValid(state.signatures.CUSTOMER) &&
    photoStepValid(state);

  useEffect(() => {
    if (!guardValid) router.replace(`/jobs/${id}/identity-correction/photo`);
  }, [guardValid, id, router]);

  useEffect(() => {
    if (!state.photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(state.photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [state.photo]);

  if (!guardValid) return null;

  const pending = submitCorrection.isPending || uploadPhoto.isPending;

  async function handleSubmit() {
    setError(null);
    try {
      const input: IdentityCorrectionSubmitInput = {
        reason: state.reason.trim(),
        ...(state.attrs.device ? { newDeviceId: state.deviceId } : {}),
        ...(state.attrs.serial ? { newSerial: state.serial.trim() } : {}),
        ...(state.attrs.akdAkl ? { newAkdAkl: state.akdAkl.trim() } : {}),
        signatures: {
          TECHNICIAN: toSignatureInput(state.signatures.TECHNICIAN),
          CUSTOMER: toSignatureInput(state.signatures.CUSTOMER),
        },
      };
      const res = await submitCorrection.mutateAsync(input);

      if (state.photo) {
        try {
          await uploadPhoto.mutateAsync({ correctionId: res.correction.id, file: state.photo });
        } catch {
          // Non-blocking: the BA is already created. The correction-detail
          // screen shows "Foto BA belum diunggah." and offers a retry there.
        }
      }

      router.replace(`/jobs/${id}/corrections/${res.correction.id}`);
    } catch (err) {
      setError(formatApiError(err, "Gagal mengajukan koreksi identitas."));
    }
  }

  return (
    <Screen
      title="Koreksi Identitas (5/5)"
      showBack
      onBack={() => router.replace(`/jobs/${id}/identity-correction/photo`)}
      footer={
        <StickyActionBar>
          <Button fullWidth disabled={pending} onClick={() => void handleSubmit()}>
            {pending ? "Mengirim…" : "Kirim"}
          </Button>
        </StickyActionBar>
      }
    >
      {error ? (
        <div className="px-4 pt-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <Section title="Alasan">
        <p className="text-sm text-slate-700">{state.reason || "—"}</p>
      </Section>

      <Section title="Perubahan">
        <div className="flex flex-col gap-2">
          {state.attrs.device ? (
            <div className="text-sm">
              <p className="text-xs text-slate-500">Alat</p>
              <p className="text-slate-900">
                {dash(job.device?.code)} <span className="text-slate-400">→</span> {dash(state.deviceLabel)}
              </p>
            </div>
          ) : null}
          {state.attrs.serial ? (
            <div className="text-sm">
              <p className="text-xs text-slate-500">Serial</p>
              <p className="text-slate-900">
                {dash(job.technicianObservedSerial)} <span className="text-slate-400">→</span>{" "}
                {dash(state.serial)}
              </p>
            </div>
          ) : null}
          {state.attrs.akdAkl ? (
            <div className="text-sm">
              <p className="text-xs text-slate-500">AKD/AKL/NIE</p>
              <p className="text-slate-900">
                {dash(job.technicianObservedAkdAkl)} <span className="text-slate-400">→</span>{" "}
                {dash(state.akdAkl)}
              </p>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Tanda Tangan">
        <div className="flex flex-col gap-3">
          <div>
            <SectionRow label="Teknisi" value={SIGNATURE_STATUS_LABELS[state.signatures.TECHNICIAN.status]} />
            {state.signatures.TECHNICIAN.status === "SIGNED" ? (
              <p className="text-xs text-slate-500">{state.signatures.TECHNICIAN.signerName}</p>
            ) : (
              <p className="text-xs text-slate-500">{state.signatures.TECHNICIAN.unavailableReason}</p>
            )}
          </div>
          <div>
            <SectionRow label="Pelanggan" value={SIGNATURE_STATUS_LABELS[state.signatures.CUSTOMER.status]} />
            {state.signatures.CUSTOMER.status === "SIGNED" ? (
              <p className="text-xs text-slate-500">{state.signatures.CUSTOMER.signerName}</p>
            ) : (
              <p className="text-xs text-slate-500">{state.signatures.CUSTOMER.unavailableReason}</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Foto BA">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Pratinjau foto BA"
            className="max-h-40 rounded border border-slate-200 bg-white object-contain"
          />
        ) : (
          <p className="text-sm text-slate-500">Tidak ada foto.</p>
        )}
      </Section>
    </Screen>
  );
}
