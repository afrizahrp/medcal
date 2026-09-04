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
import { declaredDeviceName } from "../../lib/calibration/job-display";

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

export function JobCard({ job }: { job: TechCalibrationJob }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex min-h-24 items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 active:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-slate-500">
            Unit {job.unitOrdinal} dari {job.unitTotal}
          </span>
          <span className="truncate text-sm font-medium text-slate-600">{job.workOrder.number}</span>
        </div>
        <p className="mt-0.5 truncate text-base font-semibold text-slate-900">
          {declaredDeviceName(job)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <JobStatusBadge status={job.status} />
          <AkdAklStatusBadge status={job.akdAklApprovalStatus} />
        </div>
      </div>
      <ChevronRight />
    </Link>
  );
}
