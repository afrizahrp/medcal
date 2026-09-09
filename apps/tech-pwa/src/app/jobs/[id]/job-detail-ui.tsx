import Link from "next/link";
import { Section, SectionRow } from "../../../components/ui/section";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { JobStatusBadge, AkdAklStatusBadge } from "../jobs-ui";
import type { TechCalibrationJob, TechIdentityCorrection } from "../../../lib/calibration/types";
import { IDENTITY_CORRECTION_STATUS_LABELS } from "../../../lib/calibration/types";
import type { TechReferenceEquipmentUsed } from "../../../lib/calibration/reference-equipment";
import {
  expectedReplicateCount,
  gridEntryStatus,
  parameterEntryStatus,
  usesDirection,
  type TechMeasurementParameter,
  type TechMeasurementResult,
} from "../../../lib/calibration/measurement";
import { declaredAkdAkl, declaredDeviceName } from "../../../lib/calibration/job-display";
import { RecordedReferenceEquipmentList } from "./reference-equipment/reference-equipment-ui";

const CORRECTION_BADGE_CLASS: Record<TechIdentityCorrection["status"], string> = {
  PENDING_REVIEW: "bg-amber-500",
  APPROVED: "bg-emerald-600",
  REJECTED: "bg-red-600",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function JobHeaderBlock({ job }: { job: TechCalibrationJob }) {
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4">
      <p className="text-sm font-medium text-slate-600">{job.workOrder.number}</p>
      <p className="text-xs text-slate-500">
        Unit {job.unitOrdinal} dari {job.unitTotal}
      </p>
      <div className="mt-2">
        <JobStatusBadge status={job.status} />
      </div>
    </div>
  );
}

export function DeclaredIdentitySection({ job }: { job: TechCalibrationJob }) {
  return (
    <Section title="Identitas Dinyatakan (Pelanggan)">
      <SectionRow label="Nama alat" value={declaredDeviceName(job)} />
      <SectionRow label="AKD/AKL" value={declaredAkdAkl(job)} />
    </Section>
  );
}

export function ObservedIdentitySection({ job }: { job: TechCalibrationJob }) {
  return (
    <Section title="Observasi Teknisi">
      <SectionRow label="Serial" value={job.technicianObservedSerial ?? "—"} />
      <SectionRow label="AKD/AKL" value={job.technicianObservedAkdAkl ?? "—"} />
    </Section>
  );
}

export function AssignedDeviceSection({ job }: { job: TechCalibrationJob }) {
  return (
    <Section title="Alat Terpasang Saat Ini">
      {job.device ? (
        <>
          <SectionRow label="Kode" value={job.device.code ?? "—"} />
          <SectionRow label="Serial" value={job.device.serialNumber ?? "—"} />
        </>
      ) : (
        <p className="text-sm text-slate-500">Alat belum diidentifikasi.</p>
      )}
    </Section>
  );
}

export function ApprovalStatusSection({ job }: { job: TechCalibrationJob }) {
  const showDetail = job.akdAklApprovalStatus === "APPROVED" || job.akdAklApprovalStatus === "REJECTED";
  return (
    <Section title="Status Persetujuan AKD/AKL">
      <div className="flex items-center gap-2">
        <AkdAklStatusBadge status={job.akdAklApprovalStatus} />
      </div>
      {showDetail ? (
        <div className="mt-2 space-y-1">
          {job.akdAklApprovedBy ? (
            <SectionRow label="Diputuskan oleh" value={job.akdAklApprovedBy.name ?? "—"} />
          ) : null}
          {job.akdAklApprovedAt ? (
            <SectionRow label="Tanggal" value={formatDate(job.akdAklApprovedAt)} />
          ) : null}
          {job.akdAklDecisionNote ? (
            <p className="mt-1 text-sm text-slate-600">{job.akdAklDecisionNote}</p>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

export function ReferenceEquipmentSection({
  jobId,
  used,
  canRecord,
  gateOpen,
  lockedReason,
}: {
  jobId: string;
  used: TechReferenceEquipmentUsed[];
  canRecord: boolean;
  gateOpen: boolean;
  lockedReason: string | null;
}) {
  return (
    <Section title="Alat Referensi Digunakan">
      <RecordedReferenceEquipmentList used={used} />
      {canRecord ? (
        gateOpen ? (
          <Link
            href={`/jobs/${jobId}/reference-equipment`}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 active:text-brand-800"
          >
            Catat alat referensi
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
 * server-side (`entryStyle`).
 */
export function MeasurementsSection({
  jobId,
  parameters,
  gridParameters,
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
  rowsByParameter: Map<string, TechMeasurementResult[]>;
  gridRowsByParameter: Map<string, TechMeasurementResult[]>;
  deviceTypeResolved: boolean;
  canRecord: boolean;
  entryOpen: boolean;
  lockedReason: string | null;
}) {
  const hasAny = parameters.length > 0 || gridParameters.length > 0;
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
                    pointCount,
                    expectedReplicateCount(param.code),
                    usesDirection(param.code) ? 2 : 1,
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
 */
export function StartCalibrationAction({
  onStart,
  pending,
  error,
}: {
  onStart: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div>
      <Button fullWidth onClick={onStart} disabled={pending}>
        {pending ? "Memulai…" : "Mulai Kalibrasi"}
      </Button>
      {error ? <p className="mt-1 text-center text-xs text-red-600">{error}</p> : null}
    </div>
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
