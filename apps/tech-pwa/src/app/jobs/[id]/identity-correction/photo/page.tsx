"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Screen } from "../../../../../components/layout/screen";
import { StickyActionBar } from "../../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../../components/ui/button";
import { useWizard } from "../layout";
import { photoRequired, photoStepValid, signatureValid, step1Valid } from "../wizard-state";

export default function IdentityCorrectionPhotoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { state, update, requestExit } = useWizard();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const guardValid =
    step1Valid(state) &&
    signatureValid(state.signatures.TECHNICIAN) &&
    signatureValid(state.signatures.CUSTOMER);

  useEffect(() => {
    if (!guardValid) router.replace(`/jobs/${id}/identity-correction/signature-customer`);
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

  const required = photoRequired(state);

  return (
    <Screen
      title="Koreksi Identitas (4/5)"
      showBack
      showHome
      onHome={requestExit}
      onBack={() => router.replace(`/jobs/${id}/identity-correction/signature-customer`)}
      footer={
        <StickyActionBar>
          <Button
            fullWidth
            disabled={!photoStepValid(state)}
            onClick={() => router.replace(`/jobs/${id}/identity-correction/review`)}
          >
            Lanjut
          </Button>
        </StickyActionBar>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-600">
          {required
            ? "Ambil foto lembar BA yang sudah ditandatangani."
            : "Tidak ada tanda tangan yang perlu difoto — foto bersifat opsional."}
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) update({ photo: file });
          }}
        />

        {previewUrl ? (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Pratinjau foto BA"
              className="max-h-64 w-full rounded-lg border border-slate-200 bg-white object-contain"
            />
            <Button variant="secondary" fullWidth onClick={() => fileRef.current?.click()}>
              Ambil ulang
            </Button>
          </div>
        ) : (
          <Button variant="secondary" fullWidth onClick={() => fileRef.current?.click()}>
            Ambil foto
          </Button>
        )}
      </div>
    </Screen>
  );
}
