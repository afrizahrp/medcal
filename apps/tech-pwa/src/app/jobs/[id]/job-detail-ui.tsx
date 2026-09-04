import Link from "next/link";
import { Section, SectionRow } from "../../../components/ui/section";
import { Badge } from "../../../components/ui/badge";
import { JobStatusBadge, AkdAklStatusBadge } from "../jobs-ui";
import type { TechCalibrationJob, TechIdentityCorrection } from "../../../lib/calibration/types";
import { IDENTITY_CORRECTION_STATUS_LABELS } from "../../../lib/calibration/types";
import { declaredAkdAkl, declaredDeviceName } from "../../../lib/calibration/job-display";

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
