import Link from "next/link";
import { ArrowLeft, Lock, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateOnly } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { formPageClass, formSurfaceClass, formatQty } from "../quotations/quotations-ui";
import { DetailField, PageHeader, StatusBadge, Surface } from "./work-orders-ui";
import {
  SHARED_SPK_STATUS_LABELS,
  type SharedSpkChild,
  type SharedSpkDerivedStatus,
  type SharedSpkDetail,
} from "./shared-spk-types";
import { canReviseParent, childLockReason, isChildEditable } from "./shared-spk-revision";

const PARENT_STATUS_BADGE_CLASS: Record<SharedSpkDerivedStatus, string> = {
  NOT_STARTED: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
  IN_PROGRESS: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  COMPLETED: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  CANCELLED: "border-transparent bg-slate-400 text-white hover:bg-slate-400",
};

function scheduleLabel(child: Pick<SharedSpkChild, "scheduledStart" | "scheduledEnd">): string {
  if (!child.scheduledStart && !child.scheduledEnd) return "—";
  const start = fmtDateOnly(child.scheduledStart);
  const end = fmtDateOnly(child.scheduledEnd);
  if (!child.scheduledEnd || start === end) return start;
  if (!child.scheduledStart) return end;
  return `${start} – ${end}`;
}

function technicianLabel(child: SharedSpkChild): string {
  if (child.technicians.length === 0) return "—";
  return child.technicians.map((row) => row.name ?? row.email).join(", ");
}

/**
 * Read-only Parent SPK view. The Parent is an aggregate/container: it has no
 * Start, no execution status mutation, no DLN and no schedule of its own. Its
 * status and progress are derived from its Child SPKs, which are the executable
 * work items (Start / schedule / DLN live on each Child).
 *
 * Revision is offered per Child: the entry point is shown while at least one
 * Child is still revisable, and each Child row says whether it is editable or
 * locked. The backend remains authoritative.
 */
export function SharedSpkParentView({
  parent,
  canRevise,
}: {
  parent: SharedSpkDetail;
  /** Caller holds the permissions the revision API requires (update + assign). */
  canRevise: boolean;
}) {
  const { progress } = parent;
  const revisable = canReviseParent(parent);

  return (
    <div className={formPageClass}>
      <PageHeader
        title={parent.number}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/work-orders", label: "Work Orders" },
          { label: parent.number },
        ]}
      />

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-slate-600">{parent.number}</p>
            <p className="mt-1 text-xs text-slate-400">
              SPK Induk — kontainer pekerjaan bersama. Pekerjaan dijalankan pada SPK Child.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="status" className={PARENT_STATUS_BADGE_CLASS[parent.status]}>
              {SHARED_SPK_STATUS_LABELS[parent.status]}
            </Badge>
            <div className="flex flex-wrap justify-end gap-2">
              {canRevise && revisable ? (
                <Button type="button" size="sm" asChild>
                  <Link href={`/work-orders/shared/${parent.id}/revise`}>
                    <Pencil className="h-4 w-4" />
                    Revisi Distribusi
                  </Link>
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href="/work-orders">
                  <ArrowLeft className="h-4 w-4" />
                  Back to List
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {!revisable ? (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Semua SPK Child terkunci karena pekerjaan sudah dimulai, selesai, atau dibatalkan. Tidak ada
            revisi yang tersedia.
          </p>
        ) : null}

        <dl className="mt-4 space-y-4 text-sm">
          <DetailField label="Progress">
            <div className="flex items-center gap-3">
              <span className="tabular-nums font-medium text-slate-900">
                {formatQty(progress.completed)} / {formatQty(progress.total)}
              </span>
              <span className="text-slate-500">({progress.percentage}%)</span>
            </div>
            <div
              className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percentage}
              aria-label="Progress SPK induk"
            >
              <div className="h-full bg-emerald-500" style={{ width: `${progress.percentage}%` }} />
            </div>
          </DetailField>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Customer">
              <Link
                href={`/customers/${parent.customer.id}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {parent.customer.name}
              </Link>
            </DetailField>
            <DetailField label="Purchase Order">
              <Link
                href={`/purchase-orders/${parent.purchaseOrder.id}`}
                className="font-mono text-brand-700 hover:underline"
              >
                {parent.purchaseOrder.number}
              </Link>
              <span className="ml-2 text-slate-400">({parent.purchaseOrder.customerPoNumber})</span>
            </DetailField>
          </div>
        </dl>

        <section className="mt-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            SPK Child ({parent.children.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">SPK</th>
                  <th className="px-3 py-2">Teknisi</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Progress</th>
                  <th className="px-3 py-2">Jadwal</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Revisi</th>
                  <th className="px-3 py-2">DLN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parent.children.map((child) => (
                  <tr key={child.id} className={cn(child.status === "CANCELLED" && "opacity-60")}>
                    <td className="px-3 py-3">
                      <Link
                        href={`/work-orders/${child.id}`}
                        className="font-mono text-sm font-medium text-brand-700 hover:underline"
                      >
                        {child.number}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">{technicianLabel(child)}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-900">
                      {formatQty(child.progress.total)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-700">
                      {formatQty(child.progress.completed)} / {formatQty(child.progress.total)}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">{scheduleLabel(child)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={child.status} />
                    </td>
                    <td className="px-3 py-3 text-xs" title={childLockReason(child) ?? undefined}>
                      {isChildEditable(child) ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Pencil className="h-3.5 w-3.5" /> Dapat direvisi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Lock className="h-3.5 w-3.5" /> Terkunci
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">
                      {child.deliveryNote?.number ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Surface>
    </div>
  );
}
