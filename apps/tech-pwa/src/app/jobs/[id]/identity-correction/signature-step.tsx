"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import type { IdentityCorrectionSignerRole, SignatureStatus } from "../../../../lib/calibration/types";
import { useWizard } from "./layout";
import { signatureValid } from "./wizard-state";

const STATUS_OPTIONS: { value: SignatureStatus; label: string }[] = [
  { value: "SIGNED", label: "Ditandatangani" },
  { value: "UNAVAILABLE", label: "Tidak Tersedia" },
  { value: "REFUSED", label: "Menolak" },
];

/**
 * Shared shape for Screen 2 (technician) and Screen 3 (customer) — same
 * status/name/reason form, only the role and surrounding wizard step differ.
 */
export function SignatureStepScreen({
  role,
  roleLabel,
  stepLabel,
  nextHref,
  backHref,
  guardValid,
  guardRedirectHref,
}: {
  role: IdentityCorrectionSignerRole;
  roleLabel: string;
  stepLabel: string;
  nextHref: string;
  /** Previous wizard step — the header back button replaces to here. */
  backHref: string;
  guardValid: boolean;
  guardRedirectHref: string;
}) {
  const router = useRouter();
  const { state, update } = useWizard();
  const sig = state.signatures[role];

  useEffect(() => {
    if (!guardValid) router.replace(guardRedirectHref);
  }, [guardValid, guardRedirectHref, router]);

  if (!guardValid) return null;

  function setSig(patch: Partial<typeof sig>) {
    update({ signatures: { ...state.signatures, [role]: { ...sig, ...patch } } });
  }

  return (
    <Screen
      title={`Koreksi Identitas (${stepLabel})`}
      showBack
      showHome={false}
      onBack={() => router.replace(backHref)}
      footer={
        <StickyActionBar>
          <Button fullWidth disabled={!signatureValid(sig)} onClick={() => router.replace(nextHref)}>
            Lanjut
          </Button>
        </StickyActionBar>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-600">
          Status tanda tangan {roleLabel} pada lembar BA.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">Status</legend>
          {STATUS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-base text-slate-700"
            >
              <input
                type="radio"
                name={`sig-${role}`}
                className="h-5 w-5"
                checked={sig.status === opt.value}
                onChange={() => setSig({ status: opt.value })}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>

        {sig.status === "SIGNED" ? (
          <div>
            <label htmlFor={`signer-name-${role}`} className="block text-sm font-medium text-slate-700">
              Nama penandatangan
            </label>
            <input
              id={`signer-name-${role}`}
              type="text"
              maxLength={120}
              value={sig.signerName}
              onChange={(e) => setSig({ signerName: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
            />
          </div>
        ) : (
          <div>
            <label htmlFor={`unavailable-reason-${role}`} className="block text-sm font-medium text-slate-700">
              Alasan
            </label>
            <textarea
              id={`unavailable-reason-${role}`}
              maxLength={500}
              rows={3}
              value={sig.unavailableReason}
              onChange={(e) => setSig({ unavailableReason: e.target.value })}
              placeholder="mis. pelanggan tidak di tempat"
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-base"
            />
          </div>
        )}
      </div>
    </Screen>
  );
}
