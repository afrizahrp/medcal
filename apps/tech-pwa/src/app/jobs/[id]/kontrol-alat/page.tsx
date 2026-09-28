"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../../components/layout/screen";
import { Section, SectionRow } from "../../../../components/ui/section";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState } from "../../../../components/ui/state-views";
import { SaveStatusIndicator } from "../../../../components/ui/save-status-indicator";
import { formatApiError } from "../../../../lib/api-errors";
import { computeSaveStatus } from "../../../../lib/calibration/save-status";
import { useJobQuery } from "../use-job-query";
import {
  useKontrolAlat,
  usePatchKontrolAlat,
  useUpdateKontrolAlatAccessory,
  useSignKontrolAlat,
  openKontrolAlatPdfPwa,
} from "./use-kontrol-alat-query";
import {
  buildKontrolAlatSignatureSlots,
  canEditKontrolAlat,
  KONTROL_ALAT_SIGNER_KIND_LABELS,
} from "../../../../lib/calibration/kontrol-alat";
import type {
  TechKontrolAlat,
  TechKontrolAlatAccessory,
  TechKontrolAlatSignature,
  KontrolAlatSignerKind,
} from "../../../../lib/calibration/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Tri-state bool chip ──────────────────────────────────────────────────────

function TriStateChip({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null;
  onChange: (next: boolean | null) => void;
  disabled?: boolean;
}) {
  const options: Array<{ label: string; v: boolean | null; cls: string }> = [
    { label: "—", v: null, cls: "bg-slate-100 text-slate-500" },
    { label: "Baik", v: true, cls: "bg-emerald-100 text-emerald-800" },
    { label: "Tidak", v: false, cls: "bg-red-100 text-red-800" },
  ];

  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={String(opt.v)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.v === value ? null : opt.v)}
          className={[
            // UX-11: raised to the app's own min-h-11/min-w-11 touch-target
            // convention (already used by Button/AppHeader/VerdictOption) —
            // sizing only, value semantics/labels/colors unchanged.
            "flex min-h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-opacity",
            value === opt.v ? opt.cls : "bg-slate-50 text-slate-400",
            disabled ? "cursor-not-allowed opacity-50" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Inspection rows ───────────────────────────────────────────────────────────

type InspBoolField =
  | "visualPowerCable"
  | "visualDisplay"
  | "visualButtons"
  | "functionInitialOk"
  | "functionFinalOk";

// UX-04: each inspection field owns its own `usePatchKontrolAlat` mutation
// instance (the same "one mutation per independent row" pattern already used
// by AccessoryRow below), so tapping one field only shows a pending/disabled
// state on that field — the other four rows (three Uji Visual + the sibling
// Uji Fungsi field, previously frozen by a single shared mutation) stay
// interactive while one save is in flight. The PATCH endpoint
// (`kontrol-alat.service.ts#patch`) applies each field independently via a
// `!== undefined` spread with no cross-field read of these five booleans, so
// concurrent independent PATCH calls for different fields are safe — unlike
// `workExecuted`/`notExecutedReason` below, which the server validates
// together and therefore deliberately keep sharing one mutation instance.
function InspectionFieldRow({
  label,
  field,
  value,
  canEdit,
  jobId,
}: {
  label: string;
  field: InspBoolField;
  value: boolean | null;
  canEdit: boolean;
  jobId: string;
}) {
  const patch = usePatchKontrolAlat(jobId);
  const [justSaved, setJustSaved] = useState(false);
  const status = computeSaveStatus({
    isPending: patch.isPending,
    isError: patch.isError,
    justSaved,
  });

  function handleChange(next: boolean | null) {
    setJustSaved(false);
    patch.mutate(
      { [field]: next },
      { onSuccess: () => setJustSaved(true) },
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-700">{label}</span>
        <TriStateChip value={value} onChange={handleChange} disabled={!canEdit || patch.isPending} />
      </div>
      {patch.isError ? (
        <p className="text-right text-xs text-red-600">
          {formatApiError(patch.error, "Gagal menyimpan.")}
        </p>
      ) : (
        <div className="text-right">
          <SaveStatusIndicator status={status} />
        </div>
      )}
    </div>
  );
}

function InspectionSection({
  ka,
  canEdit,
  jobId,
}: {
  ka: TechKontrolAlat;
  canEdit: boolean;
  jobId: string;
}) {
  return (
    <Section title="Hasil Inspeksi">
      {/* III. Uji Visual */}
      <p className="mb-1 mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Uji Visual
      </p>
      {(
        [
          { label: "Kabel daya / power supply", field: "visualPowerCable" as const },
          { label: "Layar / display", field: "visualDisplay" as const },
          { label: "Tombol / kontrol", field: "visualButtons" as const },
        ] as const
      ).map(({ label, field }) => (
        <InspectionFieldRow
          key={field}
          label={label}
          field={field}
          value={ka[field]}
          canEdit={canEdit}
          jobId={jobId}
        />
      ))}

      {/* III. Uji Fungsi */}
      <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Uji Fungsi
      </p>
      {(
        [
          { label: "Uji fungsi awal (sebelum kalibrasi)", field: "functionInitialOk" as const },
          { label: "Uji fungsi akhir (setelah kalibrasi)", field: "functionFinalOk" as const },
        ] as const
      ).map(({ label, field }) => (
        <InspectionFieldRow
          key={field}
          label={label}
          field={field}
          value={ka[field]}
          canEdit={canEdit}
          jobId={jobId}
        />
      ))}
    </Section>
  );
}

// ── Work executed section ─────────────────────────────────────────────────────

function WorkExecutedSection({
  ka,
  canEdit,
  jobId,
}: {
  ka: TechKontrolAlat;
  canEdit: boolean;
  jobId: string;
}) {
  // NOTE (UX-04 scope decision): workExecuted and notExecutedReason are kept
  // on this one shared mutation deliberately, not split per-field like
  // InspectionFieldRow above. The server (`kontrol-alat.service.ts#patch`)
  // validates them together — `workExecuted === false` requires a non-empty
  // `notExecutedReason`, read from `existing` at request time — so two
  // independent concurrent PATCH calls for these two fields could race and
  // spuriously fail. This is exactly the "domain dependency requiring
  // serialization" case the task calls out; only the feedback (below) changes.
  const patch = usePatchKontrolAlat(jobId);
  const [justSaved, setJustSaved] = useState(false);
  const status = computeSaveStatus({
    isPending: patch.isPending,
    isError: patch.isError,
    justSaved,
  });

  function toggle(next: boolean | null) {
    if (!canEdit) return;
    setJustSaved(false);
    const onSuccess = { onSuccess: () => setJustSaved(true) };
    if (next === true) {
      patch.mutate({ workExecuted: true, notExecutedReason: null }, onSuccess);
    } else if (next === false) {
      patch.mutate({ workExecuted: false }, onSuccess);
    } else {
      patch.mutate({ workExecuted: null }, onSuccess);
    }
  }

  return (
    <Section title="I. Pelaksanaan Pekerjaan">
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-sm text-slate-700">Pekerjaan dilaksanakan</span>
        <TriStateChip
          value={ka.workExecuted}
          onChange={toggle}
          disabled={!canEdit || patch.isPending}
        />
      </div>

      {ka.workExecuted === false ? (
        <div className="mt-2">
          <label className="text-xs font-medium text-slate-600">
            Alasan tidak dilaksanakan
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-brand-700"
            rows={2}
            maxLength={2000}
            defaultValue={ka.notExecutedReason ?? ""}
            disabled={!canEdit}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (ka.notExecutedReason ?? "")) {
                setJustSaved(false);
                patch.mutate(
                  { notExecutedReason: v || null },
                  { onSuccess: () => setJustSaved(true) },
                );
              }
            }}
          />
        </div>
      ) : null}

      {patch.isError ? (
        <p className="mt-2 text-xs text-red-600">
          {formatApiError(patch.error, "Gagal menyimpan.")}
        </p>
      ) : (
        <div className="mt-1 text-right">
          <SaveStatusIndicator status={status} />
        </div>
      )}
    </Section>
  );
}

// ── Accessories ───────────────────────────────────────────────────────────────

function AccessoryRow({
  acc,
  canEdit,
  jobId,
}: {
  acc: TechKontrolAlatAccessory;
  canEdit: boolean;
  jobId: string;
}) {
  const update = useUpdateKontrolAlatAccessory(jobId);
  const [justSaved, setJustSaved] = useState(false);
  const status = computeSaveStatus({
    isPending: update.isPending,
    isError: update.isError,
    justSaved,
  });

  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm text-slate-700">{acc.label}</span>
        <TriStateChip
          value={acc.present}
          onChange={(v) => {
            if (!canEdit) return;
            setJustSaved(false);
            update.mutate(
              { accessoryId: acc.id, input: { present: v } },
              { onSuccess: () => setJustSaved(true) },
            );
          }}
          disabled={!canEdit || update.isPending}
        />
      </div>
      {update.isError ? (
        <p className="text-right text-xs text-red-600">
          {formatApiError(update.error, "Gagal menyimpan.")}
        </p>
      ) : (
        <div className="text-right">
          <SaveStatusIndicator status={status} />
        </div>
      )}
    </div>
  );
}

function AccessoriesSection({
  ka,
  canEdit,
  jobId,
}: {
  ka: TechKontrolAlat;
  canEdit: boolean;
  jobId: string;
}) {
  if (ka.accessories.length === 0) {
    return (
      <Section title="Perlengkapan">
        <p className="text-sm text-slate-500">Belum ada perlengkapan yang didaftarkan untuk job ini.</p>
      </Section>
    );
  }

  return (
    <Section title="Perlengkapan">
      {ka.accessories.map((acc) => (
        <AccessoryRow key={acc.id} acc={acc} canEdit={canEdit} jobId={jobId} />
      ))}
    </Section>
  );
}

// ── Signatures ────────────────────────────────────────────────────────────────

function SignatureBlock({
  sig,
  canSign,
  kind,
  jobId,
}: {
  sig: TechKontrolAlatSignature | undefined;
  canSign: boolean;
  kind: KontrolAlatSignerKind;
  jobId: string;
}) {
  const signMutation = useSignKontrolAlat(jobId);
  const signed = Boolean(sig?.signedAt);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {KONTROL_ALAT_SIGNER_KIND_LABELS[kind]}
      </p>
      {signed && sig ? (
        <>
          <p className="mt-1 text-sm font-medium text-emerald-700">Ditandatangani</p>
          <p className="text-xs text-slate-500">
            {sig.signerName} · {formatDate(sig.signedAt)}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">Belum ditandatangani</p>
          {canSign ? (
            <Button
              variant="secondary"
              className="mt-2 text-sm"
              disabled={signMutation.isPending}
              onClick={() => signMutation.mutate({ signerKind: kind })}
            >
              {signMutation.isPending ? "Menandatangani…" : "Tandatangani sebagai saya"}
            </Button>
          ) : null}
          {signMutation.isError ? (
            <p className="mt-1 text-xs text-red-600">
              {formatApiError(signMutation.error, "Gagal menandatangani.")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function SignaturesSection({
  ka,
  canSign,
  jobId,
}: {
  ka: TechKontrolAlat;
  canSign: boolean;
  jobId: string;
}) {
  const slots = buildKontrolAlatSignatureSlots(ka.signatures);

  return (
    <Section title="Tanda Tangan">
      <div className="space-y-3">
        {slots.map((slot) => (
          <SignatureBlock
            key={slot.kind}
            sig={slot.signature}
            kind={slot.kind}
            canSign={canSign}
            jobId={jobId}
          />
        ))}
      </div>
    </Section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KontrolAlatPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id);
  const kaQuery = useKontrolAlat(id);

  if (jobQuery.isPending || kaQuery.isPending) {
    return (
      <Screen title="Kontrol Alat" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <Screen title="Kontrol Alat" showBack>
        <ErrorState
          message={formatApiError(jobQuery.error, "Gagal memuat job.")}
          onRetry={() => void jobQuery.refetch()}
        />
      </Screen>
    );
  }

  if (kaQuery.isError) {
    return (
      <Screen title="Kontrol Alat" showBack>
        <ErrorState
          message={formatApiError(kaQuery.error, "Gagal memuat Kontrol Alat.")}
          onRetry={() => void kaQuery.refetch()}
        />
      </Screen>
    );
  }

  const job = jobQuery.data;
  const ka = kaQuery.data;

  if (job.workOrder.serviceMode !== "SEND_TO_LAB") {
    return (
      <Screen title="Kontrol Alat" showBack>
        <Section title="Tidak Berlaku">
          <p className="text-sm text-slate-500">
            Kontrol Alat (F.MU.08) hanya berlaku untuk pekerjaan In Lab (WOL).
          </p>
        </Section>
      </Screen>
    );
  }

  if (!ka) {
    return (
      <Screen title="Kontrol Alat" showBack>
        <Section title="Kontrol Alat">
          <p className="text-sm text-slate-500">Data Kontrol Alat belum tersedia.</p>
        </Section>
      </Screen>
    );
  }

  const canRecord = Boolean(capabilities?.calibrationJobRecordKontrolAlat);
  const canEdit = canEditKontrolAlat(canRecord, job.status);

  const completed = ka.completedAt != null;

  async function handleDownloadPdf() {
    try {
      await openKontrolAlatPdfPwa(id);
    } catch {
      // silent — most browsers show their own error toast for failed downloads
    }
  }

  return (
    <Screen title="Kontrol Alat (F.MU.08)" showBack>
      {/* Status banner + download */}
      <div className="mx-4 mt-4 space-y-2">
        <div
          className={[
            "rounded-lg px-4 py-3 text-sm",
            completed
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-amber-200 bg-amber-50 text-amber-800",
          ].join(" ")}
        >
          {completed
            ? "Kontrol Alat selesai & ditandatangani — kalibrasi dapat dimulai."
            : "Kontrol Alat belum lengkap. Isi semua bagian dan tanda tangan untuk membuka kunci Mulai Kalibrasi."}
        </div>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => void handleDownloadPdf()}
        >
          Unduh PDF
        </Button>
      </div>

      {/* WO / Job info */}
      <Section title="Informasi Job">
        <SectionRow label="No. Dokumen" value={ka.number} />
        <SectionRow label="Work Order" value={job.workOrder.number} />
        <SectionRow label="Unit" value={`${job.unitOrdinal} dari ${job.unitTotal}`} />
        {job.workOrder.purchaseOrder ? (
          <SectionRow label="No. PO" value={job.workOrder.purchaseOrder.customerPoNumber || "—"} />
        ) : null}
        {ka.certificateNumber ? (
          <SectionRow label="No. Sertifikat" value={ka.certificateNumber} />
        ) : null}
        {job.status !== "PENDING" ? (
          <p className="mt-2 text-xs text-slate-400">
            Job sudah dimulai — formulir Kontrol Alat terkunci (hanya baca).
          </p>
        ) : null}
      </Section>

      <WorkExecutedSection ka={ka} canEdit={canEdit} jobId={id} />
      <AccessoriesSection ka={ka} canEdit={canEdit} jobId={id} />
      <InspectionSection ka={ka} canEdit={canEdit} jobId={id} />
      <SignaturesSection ka={ka} canSign={canRecord} jobId={id} />
    </Screen>
  );
}
