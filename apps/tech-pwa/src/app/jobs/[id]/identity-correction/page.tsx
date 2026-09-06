"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { useDebouncedValue } from "../../../../hooks/use-debounced-value";
import type { CalibrationJobDeviceCandidate } from "../../../../lib/calibration/types";
import { useDeviceCandidates } from "../use-job-query";
import { useWizard } from "./layout";
import { step1Valid } from "./wizard-state";

export default function IdentityCorrectionStep1Page() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { job, state, update } = useWizard();

  const [deviceSearch, setDeviceSearch] = useState("");
  const debouncedSearch = useDebouncedValue(deviceSearch, 400);
  const candidatesQuery = useDeviceCandidates(job.id, debouncedSearch, state.attrs.device);
  const candidates = candidatesQuery.data ?? [];

  const canContinue = step1Valid(state);

  function selectDevice(device: CalibrationJobDeviceCandidate) {
    update({
      deviceId: device.id,
      deviceLabel: [device.serialNumber ?? device.code ?? device.id, [device.brand, device.model].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" — "),
    });
  }

  return (
    <Screen
      title="Koreksi Identitas (1/5)"
      showBack
      showHome={false}
      onBack={() => router.replace(`/jobs/${id}`)}
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
              checked={state.attrs.device}
              onChange={(e) => update({ attrs: { ...state.attrs, device: e.target.checked } })}
            />
            Alat
          </label>
          {state.attrs.device ? (
            <div className="flex flex-col gap-2 pl-2">
              {state.deviceId ? (
                <p className="text-sm text-slate-600">
                  Alat terpilih: <span className="font-medium text-slate-900">{state.deviceLabel}</span>
                </p>
              ) : null}
              <input
                type="text"
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                placeholder="Cari serial / brand / model…"
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
              />
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                {candidatesQuery.isLoading ? (
                  <p className="text-sm text-slate-400">Memuat…</p>
                ) : candidatesQuery.isError ? (
                  <p className="text-sm text-red-600">Gagal memuat kandidat alat.</p>
                ) : candidates.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Tidak ada alat yang cocok. Alat harus didaftarkan lebih dulu oleh admin/kantor.
                  </p>
                ) : (
                  candidates.map((device) => (
                    <label
                      key={device.id}
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-base"
                    >
                      <input
                        type="radio"
                        name="correction-device"
                        className="h-5 w-5"
                        checked={state.deviceId === device.id}
                        onChange={() => selectDevice(device)}
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

          <label className="flex min-h-11 items-center gap-3 text-base text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={state.attrs.serial}
              onChange={(e) => update({ attrs: { ...state.attrs, serial: e.target.checked } })}
            />
            Serial
          </label>
          {state.attrs.serial ? (
            <input
              type="text"
              maxLength={120}
              value={state.serial}
              onChange={(e) => update({ serial: e.target.value })}
              placeholder="Serial yang benar"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
            />
          ) : null}

          <label className="flex min-h-11 items-center gap-3 text-base text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={state.attrs.akdAkl}
              onChange={(e) => update({ attrs: { ...state.attrs, akdAkl: e.target.checked } })}
            />
            AKD/AKL/NIE
          </label>
          {state.attrs.akdAkl ? (
            <input
              type="text"
              maxLength={120}
              value={state.akdAkl}
              onChange={(e) => update({ akdAkl: e.target.value })}
              placeholder="AKD/AKL/NIE yang benar"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
            />
          ) : null}
        </fieldset>
      </div>
    </Screen>
  );
}
