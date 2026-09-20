import Link from "next/link";
import { Section, SectionRow } from "../../../components/ui/section";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { JobStatusBadge } from "../jobs-ui";
import type { TechKontrolAlatSummary } from "../../../lib/calibration/types";
import type { TechCalibrationJob, TechIdentityCorrection } from "../../../lib/calibration/types";
import { IDENTITY_CORRECTION_STATUS_LABELS } from "../../../lib/calibration/types";
import {
  isAwaitingQualityReview,
  isQualityReviewApproved,
  latestQualityReview,
  shouldShowRejectionFeedback,
} from "../../../lib/calibration/quality-review";
import type { TechReferenceEquipmentUsed } from "../../../lib/calibration/reference-equipment";
import {
  canReplaceReferenceEquipment,
  isReferenceEquipmentApprovalPending,
  isReferenceEquipmentLocked,
} from "../../../lib/calibration/reference-equipment";
import {
  capabilityGroupSections,
  gridEntryStatus,
  hasCapabilityGroups,
  parameterEntryStatus,
  type TechMeasurementCapabilityGroup,
  type TechMeasurementParameter,
  type TechMeasurementResult,
} from "../../../lib/calibration/measurement";
import {
  physicalCheckEntryStatus,
  physicalCheckStatusChip,
  type TechPhysicalCheckItem,
  type TechPhysicalCheckResult,
} from "../../../lib/calibration/physical-check";
import { declaredDeviceName } from "../../../lib/calibration/job-display";
import { RecordedReferenceEquipmentList } from "./reference-equipment/reference-equipment-ui";
import { PhysicalCheckStatusRow } from "./physical-check/physical-check-ui";

const CORRECTION_BADGE_CLASS: Record<TechIdentityCorrection["status"], string> = {
  PENDING_REVIEW: "bg-amber-500",
  APPROVED: "bg-emerald-600",
  REJECTED: "bg-red-600",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function JobHeaderBlock({ job }: { job: TechCalibrationJob }) {
  const awaitingReview = isAwaitingQualityReview(job);
  const approved = isQualityReviewApproved(job);
  const showApprovedBadge = approved && job.status === "SUBMITTED";
  const showRejection = shouldShowRejectionFeedback(job);
  const review = latestQualityReview(job);
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4">
      <p className="text-sm font-medium text-slate-600">{job.workOrder.number}</p>
      <p className="text-xs text-slate-500">
        Unit {job.unitOrdinal} dari {job.unitTotal}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <JobStatusBadge status={job.status} />
        {awaitingReview ? (
          <Badge
            className={[
              "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              CORRECTION_BADGE_CLASS.PENDING_REVIEW,
            ].join(" ")}
          >
            {IDENTITY_CORRECTION_STATUS_LABELS.PENDING_REVIEW}
          </Badge>
        ) : null}
        {showApprovedBadge ? (
          <Badge
            className={[
              "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              CORRECTION_BADGE_CLASS.APPROVED,
            ].join(" ")}
          >
            {IDENTITY_CORRECTION_STATUS_LABELS.APPROVED}
          </Badge>
        ) : null}
      </div>
      {approved && review ? (
        <div className="mt-2 space-y-1">
          <SectionRow label="Diputuskan oleh" value={review.reviewer?.name ?? "—"} />
          {review.reviewedAt ? (
            <SectionRow label="Tanggal" value={formatDate(review.reviewedAt)} />
          ) : null}
          {review.notes ? <p className="mt-1 text-sm text-slate-600">{review.notes}</p> : null}
        </div>
      ) : null}
      {showRejection && review ? (
        <div className="mt-2 space-y-1">
          <SectionRow label="Diputuskan oleh" value={review.reviewer?.name ?? "—"} />
          {review.reviewedAt ? (
            <SectionRow label="Tanggal" value={formatDate(review.reviewedAt)} />
          ) : null}
          <SectionRow label="Catatan keputusan" value={review.notes ?? "—"} />
        </div>
      ) : null}
    </div>
  );
}

export function DeclaredIdentitySection({ job }: { job: TechCalibrationJob }) {
  return (
    <Section title="Identitas Dinyatakan (Pelanggan)">
      <SectionRow label="Nama alat" value={declaredDeviceName(job)} />
    </Section>
  );
}

export function ObservedIdentitySection({ job }: { job: TechCalibrationJob }) {
  return (
    <Section title="Observasi Teknisi">
      <SectionRow label="Serial" value={job.technicianObservedSerial ?? "—"} />
    </Section>
  );
}

/** Warning-only banner driven by `actionSignals.identityIncomplete` — does not block work. */
export function IdentityIncompleteWarning({ job }: { job: TechCalibrationJob }) {
  if (!job.actionSignals?.identityIncomplete) return null;
  return (
    <div
      role="status"
      className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      Identity perangkat belum lengkap. Silakan konfirmasi/koreksi identitas perangkat.
    </div>
  );
}

export function ReferenceEquipmentSection({
  job,
  used,
  canRecord,
  canSubmitApproval,
  submittingApproval,
  approvalError,
  onSubmitApproval,
}: {
  job: TechCalibrationJob;
  used: TechReferenceEquipmentUsed[];
  canRecord: boolean;
  canSubmitApproval: boolean;
  submittingApproval: boolean;
  approvalError: string | null;
  onSubmitApproval: () => void;
}) {
  const pending = isReferenceEquipmentApprovalPending(job);
  const replaceOpen = canReplaceReferenceEquipment(job);
  const needsRequest =
    job.actionSignals.referenceEquipmentNeedsApproval && !pending && canSubmitApproval;
  const lockedReason =
    job.startedAt === null
      ? "Job belum dimulai — alat referensi dicatat setelah kalibrasi berjalan."
      : isReferenceEquipmentLocked(job)
        ? "Job sudah dikirim — daftar alat referensi terkunci."
        : pending
          ? null
          : null;

  return (
    <Section title="Alat Referensi Digunakan">
      {pending ? (
        <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Menunggu Persetujuan MT
        </p>
      ) : null}
      <RecordedReferenceEquipmentList used={used} />
      {canRecord ? (
        replaceOpen ? (
          <Link
            href={`/jobs/${job.id}/reference-equipment`}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 active:text-brand-800"
          >
            Catat alat referensi
          </Link>
        ) : lockedReason ? (
          <p className="mt-2 text-xs text-slate-500">{lockedReason}</p>
        ) : null
      ) : null}
      {needsRequest ? (
        <div className="mt-3">
          <Button fullWidth onClick={onSubmitApproval} disabled={submittingApproval}>
            {submittingApproval ? "Mengirim…" : "Ajukan Persetujuan Alat Referensi"}
          </Button>
          {approvalError ? <p className="mt-1 text-center text-xs text-red-600">{approvalError}</p> : null}
        </div>
      ) : null}
    </Section>
  );
}

/**
 * Physical Inspection summary. Separate domain from MeasurementResult —
 * BAIK / TIDAK_BAIK (+ optional note). Entry route is flat `/physical-check`.
 */
export function PhysicalCheckSection({
  jobId,
  items,
  currentAttemptResults,
  canRecord,
  entryOpen,
  lockedReason,
}: {
  jobId: string;
  items: TechPhysicalCheckItem[];
  currentAttemptResults: TechPhysicalCheckResult[];
  canRecord: boolean;
  entryOpen: boolean;
  lockedReason: string | null;
}) {
  const hasAny = items.length > 0;
  const sectionStatus = physicalCheckEntryStatus(items, currentAttemptResults);
  const sectionChip = physicalCheckStatusChip(sectionStatus);
  const resultsByItem = new Map(
    currentAttemptResults.map((r) => [r.devicePhysicalCheckItemId, r] as const),
  );
  return (
    <Section title="Pemeriksaan Fisik">
      {!hasAny ? (
        <p className="text-sm text-slate-500">
          Tidak ada item pemeriksaan fisik yang didukung untuk jenis alat ini.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Ringkasan attempt saat ini</p>
            <span
              className={[
                "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                sectionChip.className,
              ].join(" ")}
            >
              {sectionChip.label}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => {
              const row = resultsByItem.get(item.id);
              return (
                <PhysicalCheckStatusRow
                  key={item.id}
                  name={item.name}
                  verdict={row?.verdict}
                />
              );
            })}
          </ul>
        </div>
      )}
      {canRecord ? (
        entryOpen && hasAny ? (
          <Link
            href={`/jobs/${jobId}/physical-check`}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 active:text-brand-800"
          >
            Catat Pemeriksaan Fisik
          </Link>
        ) : lockedReason ? (
          <p className="mt-2 text-xs text-slate-500">{lockedReason}</p>
        ) : null
      ) : null}
    </Section>
  );
}

/**
 * Measurement entry (Pattern A direct + Pattern B grid). Compact per-parameter
 * lists with entry status, plus "Catat Hasil Pengukuran" when the job is
 * IN_PROGRESS and the actor may record. LOGGER_SUMMARY is resolved out
 * server-side (`entryStyle`). Visual grouping uses `capabilityGroups` when
 * present; input-method sections are a legacy fallback only.
 */
export function MeasurementsSection({
  jobId,
  parameters,
  gridParameters,
  capabilityGroups,
  rowsByParameter,
  gridRowsByParameter,
  deviceTypeResolved,
  canRecord,
  entryOpen,
  lockedReason,
}: {
  jobId: string;
  parameters: TechMeasurementParameter[];
  gridParameters: TechMeasurementParameter[];
  capabilityGroups?: TechMeasurementCapabilityGroup[];
  rowsByParameter: Map<string, TechMeasurementResult[]>;
  gridRowsByParameter: Map<string, TechMeasurementResult[]>;
  deviceTypeResolved: boolean;
  canRecord: boolean;
  entryOpen: boolean;
  lockedReason: string | null;
}) {
  const grouped = hasCapabilityGroups(capabilityGroups);
  const capabilitySections = grouped ? capabilityGroupSections(capabilityGroups) : [];
  const hasAny = grouped
    ? capabilitySections.length > 0
    : parameters.length > 0 || gridParameters.length > 0;
  return (
    <Section title="Hasil Pengukuran">
      {!deviceTypeResolved ? (
        <p className="text-sm text-slate-500">
          Jenis alat job belum dapat ditentukan — parameter pengukuran belum tersedia.
        </p>
      ) : !hasAny ? (
        <p className="text-sm text-slate-500">
          Tidak ada parameter pengukuran yang didukung untuk jenis alat ini.
        </p>
      ) : grouped ? (
        <div className="flex flex-col gap-3">
          {capabilitySections.map((section) => (
            <div key={section.id}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {section.name}
              </p>
              <ul className="flex flex-col gap-1.5">
                {section.parameters.map(({ parameter, pointCount }) => {
                  const status =
                    pointCount !== undefined
                      ? gridEntryStatus(
                          gridRowsByParameter.get(parameter.id) ?? [],
                          (parameter.testPoints ?? []).map((tp) => tp.id),
                        )
                      : parameterEntryStatus(rowsByParameter.get(parameter.id) ?? []);
                  return (
                    <MeasurementStatusRow key={parameter.id} name={parameter.name} status={status} />
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {parameters.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Pembacaan langsung
              </p>
              <ul className="flex flex-col gap-1.5">
                {parameters.map((param) => {
                  const status = parameterEntryStatus(rowsByParameter.get(param.id) ?? []);
                  return (
                    <MeasurementStatusRow key={param.id} name={param.name} status={status} />
                  );
                })}
              </ul>
            </div>
          ) : null}
          {gridParameters.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Grid titik uji
              </p>
              <ul className="flex flex-col gap-1.5">
                {gridParameters.map((param) => {
                  const pointCount = param.testPoints?.length ?? 0;
                  const status = gridEntryStatus(
                    gridRowsByParameter.get(param.id) ?? [],
                    (param.testPoints ?? []).map((tp) => tp.id),
                  );
                  return (
                    <MeasurementStatusRow key={param.id} name={param.name} status={status} />
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      {canRecord ? (
        entryOpen && deviceTypeResolved && hasAny ? (
          <Link
            href={`/jobs/${jobId}/measurements`}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 active:text-brand-800"
          >
            Catat Hasil Pengukuran
          </Link>
        ) : lockedReason ? (
          <p className="mt-2 text-xs text-slate-500">{lockedReason}</p>
        ) : null
      ) : null}
    </Section>
  );
}

function MeasurementStatusRow({
  name,
  status,
}: {
  name: string;
  status: { complete: boolean; anyFail: boolean; filled: number; total: number };
}) {
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="min-w-0 truncate text-slate-700">{name}</span>
      <span
        className={[
          "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
          status.complete
            ? status.anyFail
              ? "bg-red-100 text-red-800"
              : "bg-emerald-100 text-emerald-800"
            : "bg-slate-100 text-slate-600",
        ].join(" ")}
      >
        {status.complete
          ? status.anyFail
            ? "Ada tidak sesuai"
            : "Selesai"
          : `${status.filled}/${status.total}`}
      </span>
    </li>
  );
}

/**
 * "Mulai Kalibrasi" — the single start action. Shown in the job-detail footer
 * while the job is still PENDING (startedAt === null). On success the job
 * becomes IN_PROGRESS and the "Job belum dimulai" gates in this screen and the
 * reference-equipment screen unlock.
 *
 * For SEND_TO_LAB (WOL) jobs: disabled with explanation when Kontrol Alat has
 * not been completed and dual-signed yet (gate enforced server-side too).
 */
export function StartCalibrationAction({
  onStart,
  pending,
  error,
  gateBlocked,
  gateReason,
}: {
  onStart: () => void;
  pending: boolean;
  error: string | null;
  /** True when the server-side Kontrol Alat gate would reject the start. */
  gateBlocked?: boolean;
  /** Human-readable reason shown below the disabled button. */
  gateReason?: string | null;
}) {
  return (
    <div>
      <Button fullWidth onClick={onStart} disabled={pending || gateBlocked}>
        {pending ? "Memulai…" : "Mulai Kalibrasi"}
      </Button>
      {gateBlocked && gateReason ? (
        <p className="mt-1 text-center text-xs text-amber-700">{gateReason}</p>
      ) : null}
      {error ? <p className="mt-1 text-center text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function SubmitForReviewAction({
  onSubmit,
  pending,
  error,
  disabled,
  disabledReason,
}: {
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  return (
    <div>
      <Button fullWidth disabled={pending || disabled} onClick={onSubmit}>
        {pending ? "Mengirim…" : "Kirim hasil ke review mutu"}
      </Button>
      {disabled && disabledReason ? (
        <p className="mt-1 text-center text-xs text-amber-700">{disabledReason}</p>
      ) : null}
      {error ? <p className="mt-1 text-center text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function ResumeAfterReworkAction({
  onResume,
  pending,
  error,
}: {
  onResume: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div>
      <Button fullWidth disabled={pending} onClick={onResume}>
        {pending ? "Melanjutkan…" : "Lanjutkan perbaikan"}
      </Button>
      {error ? <p className="mt-1 text-center text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function CompleteJobAction({
  onComplete,
  pending,
  error,
}: {
  onComplete: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div>
      <Button fullWidth disabled={pending} onClick={onComplete}>
        Selesai
      </Button>
      {error ? <p className="mt-1 text-center text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function StatusCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5.5L15.5 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Kontrol Alat (F.MU.08) intake & inspection status for SEND_TO_LAB jobs.
 * ON_SITE jobs do not have a Kontrol Alat row — this section must not render.
 */
export function KontrolAlatSection({
  jobId,
  kontrolAlat,
  canRecord,
}: {
  jobId: string;
  kontrolAlat: TechKontrolAlatSummary | null;
  canRecord: boolean;
}) {
  const completed = kontrolAlat?.completedAt != null;

  return (
    <Section title="Kontrol Alat (F.MU.08)">
      <div className="flex items-center gap-2">
        {completed ? (
          <StatusCheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <StatusClockIcon className="h-4 w-4 shrink-0 text-amber-500" />
        )}
        <span className={`text-sm font-medium ${completed ? "text-emerald-700" : "text-amber-700"}`}>
          {completed ? "Selesai & ditandatangani" : "Belum lengkap"}
        </span>
      </div>

      {kontrolAlat?.number ? (
        <SectionRow label="No. Dokumen" value={kontrolAlat.number} />
      ) : null}

      {kontrolAlat?.certificateNumber ? (
        <SectionRow label="No. Sertifikat" value={kontrolAlat.certificateNumber} />
      ) : null}

      {!completed && canRecord ? (
        <Link
          href={`/jobs/${jobId}/kontrol-alat`}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 active:text-brand-800"
        >
          Isi / lengkapi Kontrol Alat
        </Link>
      ) : completed && canRecord ? (
        <Link
          href={`/jobs/${jobId}/kontrol-alat`}
          className="mt-3 inline-flex min-h-11 items-center text-sm text-slate-500 active:text-slate-600"
        >
          Lihat detail Kontrol Alat
        </Link>
      ) : null}
    </Section>
  );
}

export function CorrectionsListSection({
  jobId,
  corrections,
}: {
  jobId: string;
  corrections: TechIdentityCorrection[];
}) {
  return (
    <Section title="Koreksi Identitas (BA)">
      {corrections.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada koreksi identitas.</p>
      ) : (
        <div className="-mx-4 flex flex-col">
          {corrections.map((c) => (
            <Link
              key={c.id}
              href={`/jobs/${jobId}/corrections/${c.id}`}
              className="flex min-h-11 items-center justify-between gap-2 px-4 py-2 active:bg-slate-50"
            >
              <span className="text-sm font-medium text-slate-900">{c.number}</span>
              <div className="flex items-center gap-2">
                <Badge className={["rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", CORRECTION_BADGE_CLASS[c.status]].join(" ")}>
                  {IDENTITY_CORRECTION_STATUS_LABELS[c.status]}
                </Badge>
                <span className="text-xs text-slate-400">{formatDate(c.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
