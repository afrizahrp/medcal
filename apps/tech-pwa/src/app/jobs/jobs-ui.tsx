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
} from "../../lib/calibration/types";
import {
  declaredDeviceName,
  groupJobsByWorkOrder,
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

// Soft tint for the per-unit ordinal chip — lets a technician scan a work
// order's progress at a glance without reading every status badge.
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

function UnitRow({ job }: { job: TechCalibrationJob }) {
  // "Tidak Diperlukan" is the absence of a requirement, not a state the
  // technician acts on — keep the row uncluttered and surface the AKD/AKL
  // badge only when it carries a decision. (Full status stays on the detail page.)
  const showAkdAkl = job.akdAklApprovalStatus !== "NOT_REQUIRED";

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex min-h-16 items-center gap-3 px-3 py-3 active:bg-slate-50"
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
        <p className="truncate text-sm font-semibold text-slate-900">{declaredDeviceName(job)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <JobStatusBadge status={job.status} />
          {showAkdAkl ? <AkdAklStatusBadge status={job.akdAklApprovalStatus} /> : null}
        </div>
      </div>
      <ChevronRight />
    </Link>
  );
}

function WorkOrderGroup({ group }: { group: WorkOrderJobGroup }) {
  const total = group.jobs.length;
  const progress =
    group.doneCount > 0 ? `${group.doneCount}/${total} selesai` : `${total} unit`;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <span className="truncate text-sm font-semibold tracking-wide text-slate-700">
          {group.workOrderNumber}
        </span>
        <span className="shrink-0 text-xs font-medium text-slate-500">{progress}</span>
      </header>
      <div className="divide-y divide-slate-100">
        {group.jobs.map((job) => (
          <UnitRow key={job.id} job={job} />
        ))}
      </div>
    </section>
  );
}

export function JobsList({ jobs }: { jobs: TechCalibrationJob[] }) {
  const groups = groupJobsByWorkOrder(jobs);

  return (
    <div className="flex flex-col gap-3 p-3">
      {groups.map((group) => (
        <WorkOrderGroup key={group.workOrderId} group={group} />
      ))}
    </div>
  );
}
