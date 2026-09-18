"use client";

import { useParams, useRouter } from "next/navigation";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { useWizard } from "./layout";
import { currentBrand, currentModel, currentSerial, step1Valid } from "./wizard-state";

function dash(v: string): string {
  return v.trim() ? v : "—";
}

export default function IdentityCorrectionStep1Page() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { job, state, update, requestExit } = useWizard();

  const canContinue = step1Valid(state);

  return (
    <Screen
      title="Koreksi Identitas (1/5)"
      showBack
      showHome
      onHome={requestExit}
      onBack={() => router.replace("/jobs")}
      footer={
        <StickyActionBar>
          <Button
            fullWidth
            disabled={!canContinue}
            onClick={() => router.replace(`/jobs/${id}/identity-correction/signature-technician`)}
          >
            Lanjut
          </Button>
        </StickyActionBar>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-600">
          Jelaskan alasan koreksi dan pilih minimal satu atribut yang perlu diperbaiki.
        </p>

        {/* Alat ditetapkan oleh WO/SPK — konteks saja, tidak dapat diubah lewat BA. */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Alat (ditetapkan oleh WO/SPK)</p>
          <p className="mt-0.5 text-sm font-medium text-slate-900">{dash(job.device?.code ?? "")}</p>
          <p className="mt-1 text-xs text-slate-500">
            Alat pada job ini tidak dapat diganti. Koreksi hanya untuk identitas yang terbaca di
            lapangan.
          </p>
        </div>

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-slate-700">
            Alasan koreksi
          </label>
          <textarea
            id="reason"
            maxLength={2000}
            rows={3}
            value={state.reason}
            onChange={(e) => update({ reason: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-slate-700">Atribut yang dikoreksi</legend>

          <label className="flex min-h-11 items-center gap-3 text-base text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={state.attrs.brand}
              onChange={(e) => update({ attrs: { ...state.attrs, brand: e.target.checked } })}
            />
            Merk
          </label>
          {state.attrs.brand ? (
            <div className="flex flex-col gap-1 pl-2">
              <p className="text-xs text-slate-500">Saat ini: {dash(currentBrand(job))}</p>
              <input
                type="text"
                maxLength={120}
                value={state.brand}
                onChange={(e) => update({ brand: e.target.value })}
                placeholder="Merk yang benar"
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
              />
            </div>
          ) : null}

          <label className="flex min-h-11 items-center gap-3 text-base text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={state.attrs.model}
              onChange={(e) => update({ attrs: { ...state.attrs, model: e.target.checked } })}
            />
            Model / Tipe
          </label>
          {state.attrs.model ? (
            <div className="flex flex-col gap-1 pl-2">
              <p className="text-xs text-slate-500">Saat ini: {dash(currentModel(job))}</p>
              <input
                type="text"
                maxLength={120}
                value={state.model}
                onChange={(e) => update({ model: e.target.value })}
                placeholder="Model / tipe yang benar"
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
              />
            </div>
          ) : null}

          <label className="flex min-h-11 items-center gap-3 text-base text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={state.attrs.serial}
              onChange={(e) => update({ attrs: { ...state.attrs, serial: e.target.checked } })}
            />
            Serial No
          </label>
          {state.attrs.serial ? (
            <div className="flex flex-col gap-1 pl-2">
              <p className="text-xs text-slate-500">Saat ini: {dash(currentSerial(job))}</p>
              <input
                type="text"
                maxLength={120}
                value={state.serial}
                onChange={(e) => update({ serial: e.target.value })}
                placeholder="Serial No yang benar"
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
              />
            </div>
          ) : null}
        </fieldset>
      </div>
    </Screen>
  );
}
