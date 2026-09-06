import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import type {
  AkdAklApprovalStatus,
  CalibrationJobStatus,
  TechCalibrationJob,
} from "../../lib/calibration/types";
import {
  AKD_AKL_APPROVAL_STATUS_LABELS,
  CALIBRATION_JOB_STATUS_LABELS,
  IDENTITY_CORRECTION_STATUS_LABELS,
  type IdentityCorrectionStatus,
} from "../../lib/calibration/types";
import {
  declaredDeviceName,
  groupJobsByCustomer,
  type CustomerJobGroup,
  type WorkOrderJobGroup,
} from "../../lib/calibration/job-display";

const badgeBase = "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

const AKD_AKL_BADGE_CLASS: Record<AkdAklApprovalStatus, string> = {
  NOT_REQUIRED: "bg-slate-400",
  PENDING_REVIEW: "bg-amber-500",
  APPROVED: "bg-emerald-600",
  REJECTED: "bg-red-600",
};

const JOB_STATUS_BADGE_CLASS: Record<CalibrationJobStatus, string> = {
  PENDING: "bg-slate-500",
  IN_PROGRESS: "bg-amber-500",
  SUBMITTED: "bg-blue-600",
  REWORK: "bg-orange-500",
  ACCEPTED_BY_QA: "bg-emerald-600",
};

const IDENTITY_CORRECTION_BADGE_CLASS: Record<IdentityCorrectionStatus, string> = {
  PENDING_REVIEW: "bg-amber-500",
  APPROVED: "bg-emerald-600",
  REJECTED: "bg-red-600",
};

export function IdentityCorrectionBadge({ status }: { status: IdentityCorrectionStatus }) {
  return (
    <Badge className={[badgeBase, IDENTITY_CORRECTION_BADGE_CLASS[status]].join(" ")}>
      BA {IDENTITY_CORRECTION_STATUS_LABELS[status]}
    </Badge>
  );
}

const ORDINAL_CLASS: Record<CalibrationJobStatus, string> = {
  PENDING: "bg-slate-100 text-slate-500",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  REWORK: "bg-orange-100 text-orange-700",
  ACCEPTED_BY_QA: "bg-emerald-100 text-emerald-700",
};

export function JobStatusBadge({ status }: { status: CalibrationJobStatus }) {
  return (
    <Badge className={[badgeBase, JOB_STATUS_BADGE_CLASS[status]].join(" ")}>
      {CALIBRATION_JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

export function AkdAklStatusBadge({ status }: { status: AkdAklApprovalStatus }) {
  return (
    <Badge className={[badgeBase, AKD_AKL_BADGE_CLASS[status]].join(" ")}>
      {AKD_AKL_APPROVAL_STATUS_LABELS[status]}
    </Badge>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QueueCardLink({
  href,
  title,
  secondary,
  progress,
}: {
  href: string;
  title: string;
  secondary: string;
  progress: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm active:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{secondary}</p>
        <p className="mt-0.5 text-xs text-slate-500">{progress}</p>
      </div>
      <ChevronRight />
    </Link>
  );
}

function UnitRow({ job }: { job: TechCalibrationJob }) {
  // "Tidak Diperlukan" is the absence of a requirement, not a state the
  // technician acts on — keep the row uncluttered and surface the AKD/AKL
  // badge only when it carries a decision. (Full status stays on the detail page.)
  const showAkdAkl = job.akdAklApprovalStatus !== "NOT_REQUIRED";
  // Most-recent Identity Correction BA — the technician's cue on whether the
  // office has reviewed the identity they submitted.
  const latestCorrection = job.identityCorrections[0] ?? null;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm active:bg-slate-50"
    >
      <span
        className={[
          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold",
          ORDINAL_CLASS[job.status],
        ].join(" ")}
        aria-label={`Unit ${job.unitOrdinal} dari ${job.unitTotal}`}
      >
        {job.unitOrdinal}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">
          Unit {job.unitOrdinal} dari {job.unitTotal}
        </p>
        <p className="truncate text-sm font-semibold text-slate-900">{declaredDeviceName(job)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <JobStatusBadge status={job.status} />
          {latestCorrection ? <IdentityCorrectionBadge status={latestCorrection.status} /> : null}
          {showAkdAkl ? <AkdAklStatusBadge status={job.akdAklApprovalStatus} /> : null}
        </div>
        {job.deviceId == null ? (
          <p className="mt-1 text-xs text-slate-500">Belum diidentifikasi</p>
        ) : null}
      </div>
      <ChevronRight />
    </Link>
  );
}

function CustomerList({ customers }: { customers: CustomerJobGroup[] }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {customers.map((customer) => (
        <QueueCardLink
          key={customer.customerId}
          href={`/jobs?customerId=${encodeURIComponent(customer.customerId)}`}
          title={customer.customerName}
          secondary={`${customer.spkCount} SPK · ${customer.deviceCount} perangkat`}
          progress={`${customer.doneCount} selesai · ${customer.openCount} belum selesai`}
        />
      ))}
    </div>
  );
}

function SpkList({ customer }: { customer: CustomerJobGroup }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="px-1 text-sm text-slate-600">
        {customer.spkCount} SPK · {customer.deviceCount} perangkat
      </p>
      {customer.workOrders.map((spk) => (
        <QueueCardLink
          key={spk.workOrderId}
          href={`/jobs?customerId=${encodeURIComponent(customer.customerId)}&workOrderId=${encodeURIComponent(spk.workOrderId)}`}
          title={spk.workOrderNumber}
          secondary={`${spk.jobs.length} perangkat`}
          progress={`${spk.doneCount} selesai · ${spk.openCount} belum selesai`}
        />
      ))}
    </div>
  );
}

function DeviceList({
  customer,
  spk,
}: {
  customer: CustomerJobGroup;
  spk: WorkOrderJobGroup;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="px-1">
        <p className="text-sm text-slate-600">{customer.customerName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {spk.jobs.length} perangkat · {spk.doneCount} selesai · {spk.openCount} belum selesai
        </p>
      </div>
      {spk.jobs.map((job) => (
        <UnitRow key={job.id} job={job} />
      ))}
    </div>
  );
}

export function JobsHierarchy({
  jobs,
  customerId,
  workOrderId,
}: {
  jobs: TechCalibrationJob[];
  customerId: string | null;
  workOrderId: string | null;
}) {
  const customers = groupJobsByCustomer(jobs);

  if (customerId) {
    const customer = customers.find((c) => c.customerId === customerId);
    if (!customer) {
      return (
        <div className="px-4 py-12 text-center text-sm text-slate-600">
          Pelanggan tidak ditemukan di daftar job Anda.
        </div>
      );
    }

    if (workOrderId) {
      const spk = customer.workOrders.find((w) => w.workOrderId === workOrderId);
      if (!spk) {
        return (
          <div className="px-4 py-12 text-center text-sm text-slate-600">
            SPK tidak ditemukan untuk pelanggan ini.
          </div>
        );
      }
      return <DeviceList customer={customer} spk={spk} />;
    }

    return <SpkList customer={customer} />;
  }

  return <CustomerList customers={customers} />;
}
