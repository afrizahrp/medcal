import {
  certificateCountLabel,
  formatCount,
  workOrderStatusLabel,
  type CustomerProgress,
  type CustomerWorkOrderStatus,
} from "../lib/customer-work-orders";

const STATUS_CLASS: Record<CustomerWorkOrderStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-amber-100 text-amber-900",
  COMPLETED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-red-100 text-red-800",
};

export function WorkOrderStatusBadge({ status }: { status: CustomerWorkOrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {workOrderStatusLabel(status)}
    </span>
  );
}

export function WorkOrderProgress({
  progress,
  showPercentage = false,
}: {
  progress: CustomerProgress;
  showPercentage?: boolean;
}) {
  const width = Math.min(100, Math.max(0, progress.percentage));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm text-slate-700">
        <p>
          {formatCount(progress.completed)} / {formatCount(progress.total)} selesai
        </p>
        {showPercentage ? <p className="font-medium text-slate-900">{progress.percentage}%</p> : null}
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={width}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progres kalibrasi"
      >
        <div className="h-full rounded-full bg-brand-700" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Dalam proses {formatCount(progress.inProgress)} · Belum dimulai {formatCount(progress.notStarted)}
      </p>
    </div>
  );
}

export function CertificateCount({ count }: { count: number }) {
  return <p className="text-sm text-slate-700">{certificateCountLabel(count)}</p>;
}
