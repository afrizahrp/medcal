"use client";

import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import { actionBadgeLabel, jobNeedsAction, type CalibrationJobActionSignals } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import { ConfirmDialog, DetailField } from "../calibration-requests/calibration-requests-ui";
import {
  formPageClass,
  formSurfaceClass,
  formatDate,
  formatDateTime,
} from "../quotations/quotations-ui";
import {
  AKD_AKL_APPROVAL_STATUS_LABELS,
  AKD_AKL_APPROVAL_STATUS_VALUES,
  CALIBRATION_JOB_STATUS_LABELS,
  CALIBRATION_JOB_STATUS_VALUES,
  calibrationJobActionFocusHref,
  firstActionableJobId,
  isAwaitingQualityReview,
  type AkdAklApprovalStatus,
  type CalibrationJobStatus,
} from "./calibration-job-utils";

export {
  PageHeader,
  Surface,
  selectClassName,
  PaginationBar,
  ConfirmDialog,
  DetailField,
  formPageClass,
  formSurfaceClass,
  formatDate,
  formatDateTime,
};

// ── API row types (mirror CalibrationJobDetail from calibration-jobs.service) ──

export interface CalibrationJobDeviceTypeRef {
  id: string;
  code: string;
  name: string;
}

export interface KontrolAlatSummary {
  id: string;
  number: string;
  workExecuted: boolean | null;
  completedAt: string | null;
  certificateNumber: string | null;
}

export interface CalibrationJobRow {
  id: string;
  companyId: string;
  workOrderId: string;
  purchaseOrderItemId: string | null;
  deviceId: string | null;
  calibrationRequestItemId: string | null;
  unitOrdinal: number;
  unitTotal: number;
  customerDeclaredDeviceName: string | null;
  customerDeclaredAkdAkl: string | null;
  technicianObservedSerial: string | null;
  technicianObservedAkdAkl: string | null;
  akdAklApprovalStatus: AkdAklApprovalStatus;
  akdAklApprovedByUserId: string | null;
  akdAklApprovedAt: string | null;
  akdAklDecisionNote: string | null;
  status: CalibrationJobStatus;
  startedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workOrder: {
    id: string;
    number: string;
    status: string;
    customerId: string;
    customer: { id: string; name: string };
    /** SEND_TO_LAB = WOL; ON_SITE = SPK. */
    serviceMode: "SEND_TO_LAB" | "ON_SITE";
    purchaseOrder: { customerPoNumber: string; number: string } | null;
    requestReviewCompletedAt: string | null;
  };
  /** Kontrol Alat summary. Null for ON_SITE jobs. */
  kontrolAlat: KontrolAlatSummary | null;
  device: {
    id: string;
    code: string | null;
    serialNumber: string | null;
    deviceTypeId: string;
    customerId: string;
  } | null;
  calibrationRequestItem: {
    id: string;
    customerDeviceName: string | null;
    akdAkl: string | null;
    deviceTypeId: string | null;
    deviceType: CalibrationJobDeviceTypeRef | null;
  } | null;
  purchaseOrderItem: {
    quotationItem: {
      requestItem: {
        deviceTypeId: string | null;
        deviceType: CalibrationJobDeviceTypeRef | null;
      } | null;
    } | null;
  } | null;
  akdAklApprovedBy: { id: string; name: string | null } | null;
  /** Most-recent Identity Correction BA on this job (any status), or []. */
  identityCorrections: {
    id: string;
    number: string;
    status: IdentityCorrectionStatus;
    createdAt: string;
  }[];
  /** Latest QualityReview from GET job `reviews` take 1. Empty until MT decides. */
  reviews: CalibrationJobQualityReview[];
  currentAttempt: number;
  /**
   * Computed server-side: at least one confirmed reference-equipment unit for
   * this job is currently invalid (expired / no certificate) and not yet
   * overridden by a TECHNICIAN_MANAGER. Drives the "Perlu Persetujuan Alat" badge.
   */
  needsReferenceEquipmentReview: boolean;
  /**
   * Extensible per-job "needs action" signal map (Identity Correction pending,
   * Reference Equipment needs approval, …future phases). Computed server-side.
   */
  actionSignals: CalibrationJobActionSignals;
}

export interface CalibrationJobListResponse {
  data: CalibrationJobRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** One SPK (WorkOrder) group — mirror of CalibrationJobWorkOrderGroup. */
export interface CalibrationJobWorkOrderGroup {
  workOrder: CalibrationJobRow["workOrder"];
  jobCount: number;
  /** Child jobs with ≥1 active action signal — computed server-side. */
  actionNeededCount: number;
  jobs: CalibrationJobRow[];
}

export interface CalibrationJobGroupedResponse {
  data: CalibrationJobWorkOrderGroup[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalJobs: number;
}

export interface CalibrationJobDeviceCandidate {
  id: string;
  code: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  deviceTypeId: string;
  deviceType: CalibrationJobDeviceTypeRef | null;
}

// ── Derived display helpers ───────────────────────────────────────────────────

/** DeviceType resolved from the commercial chain (mirrors resolveJobDeviceTypeId). */
export function resolvedDeviceType(row: CalibrationJobRow): CalibrationJobDeviceTypeRef | null {
  return (
    row.calibrationRequestItem?.deviceType ??
    row.purchaseOrderItem?.quotationItem?.requestItem?.deviceType ??
    null
  );
}

export function declaredDeviceName(row: CalibrationJobRow): string {
  return row.customerDeclaredDeviceName ?? row.calibrationRequestItem?.customerDeviceName ?? "—";
}

export function declaredAkdAkl(row: CalibrationJobRow): string {
  return row.customerDeclaredAkdAkl ?? row.calibrationRequestItem?.akdAkl ?? "—";
}

// ── Badges ────────────────────────────────────────────────────────────────────

const AKD_AKL_BADGE_CLASS: Record<AkdAklApprovalStatus, string> = {
  NOT_REQUIRED: "border-transparent bg-slate-400 text-white hover:bg-slate-400",
  PENDING_REVIEW: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  APPROVED: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  REJECTED: "border-transparent bg-red-600 text-white hover:bg-red-600",
};

const JOB_STATUS_BADGE_CLASS: Record<CalibrationJobStatus, string> = {
  PENDING: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
  IN_PROGRESS: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  SUBMITTED: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
  REWORK: "border-transparent bg-orange-500 text-white hover:bg-orange-500",
  ACCEPTED_BY_QA: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
};

export function AkdAklStatusBadge({ status }: { status: AkdAklApprovalStatus }) {
  return (
    <Badge variant="status" className={AKD_AKL_BADGE_CLASS[status]}>
      {AKD_AKL_APPROVAL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: CalibrationJobStatus }) {
  return (
    <Badge variant="status" className={JOB_STATUS_BADGE_CLASS[status]}>
      {CALIBRATION_JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

export type IdentityCorrectionStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export type QualityReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type QualityReviewDecision = "APPROVE" | "REJECT";

export interface CalibrationJobQualityReview {
  id: string;
  status: QualityReviewStatus;
  decision: QualityReviewDecision | null;
  notes: string | null;
  reviewerUserId: string;
  reviewedAt: string | null;
  createdAt: string;
  reviewer: { id: string; name: string | null };
}

const IDENTITY_CORRECTION_BADGE_CLASS: Record<IdentityCorrectionStatus, string> = {
  PENDING_REVIEW: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  APPROVED: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  REJECTED: "border-transparent bg-red-600 text-white hover:bg-red-600",
};

const IDENTITY_CORRECTION_STATUS_LABELS: Record<IdentityCorrectionStatus, string> = {
  PENDING_REVIEW: "Menunggu Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

export function IdentityCorrectionStatusBadge({ status }: { status: IdentityCorrectionStatus }) {
  return (
    <Badge variant="status" className={IDENTITY_CORRECTION_BADGE_CLASS[status]}>
      {IDENTITY_CORRECTION_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Reference-equipment validity, as recorded on the job. The used-equipment
 * endpoint persists only `validityOverridden` (not the specific failing
 * status), so this badge has two states — see the amber row treatment in the
 * job detail page for the override detail (who / when / why).
 */
export function JobReferenceEquipmentValidityBadge({ overridden }: { overridden: boolean }) {
  return (
    <Badge
      variant="status"
      className={
        overridden
          ? "border-transparent bg-amber-500 text-white hover:bg-amber-500"
          : "border-transparent bg-emerald-600 text-white hover:bg-emerald-600"
      }
    >
      {overridden ? "Validitas di-override" : "Valid"}
    </Badge>
  );
}

/**
 * "Perlu Persetujuan Alat" — a job has ≥1 confirmed reference-equipment unit
 * with an invalid/expired certificate that a TECHNICIAN_MANAGER has not yet
 * overridden. Shared by the Calibration Jobs list and the Work Order items table.
 */
export function ReferenceEquipmentReviewBadge() {
  return (
    <Badge variant="status" className="border-transparent bg-red-600 text-white hover:bg-red-600">
      Perlu Persetujuan Alat
    </Badge>
  );
}

// ── List: filters / table / empty state ───────────────────────────────────────

export function CalibrationJobFilters({
  searchInput,
  onSearchChange,
  approvalStatus,
  onApprovalStatusChange,
  jobStatus,
  onJobStatusChange,
  workOrderId,
  onClearWorkOrder,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  approvalStatus: string;
  onApprovalStatusChange: (value: string) => void;
  jobStatus: string;
  onJobStatusChange: (value: string) => void;
  workOrderId?: string;
  onClearWorkOrder: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari nomor SPK/WOL, nama alat, atau serial…"
            className="pl-9"
            aria-label="Cari calibration job"
          />
        </div>
        <select
          value={approvalStatus}
          onChange={(e) => onApprovalStatusChange(e.target.value)}
          className={cn(selectClassName, "w-full sm:w-48")}
          aria-label="Filter status persetujuan AKD/AKL"
        >
          <option value="">Semua status AKD/AKL</option>
          {AKD_AKL_APPROVAL_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {AKD_AKL_APPROVAL_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={jobStatus}
          onChange={(e) => onJobStatusChange(e.target.value)}
          className={cn(selectClassName, "w-full sm:w-44")}
          aria-label="Filter status job"
        >
          <option value="">Semua status job</option>
          {CALIBRATION_JOB_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {CALIBRATION_JOB_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {workOrderId ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>
            Difilter untuk Work Order{" "}
            <span className="font-mono text-slate-700">{workOrderId}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onClearWorkOrder}>
            Hapus filter WO
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Parent (SPK) aggregate: "N perlu tindakan" when ≥1 child job carries any
 * actionable signal. `count` is computed server-side (CalibrationJobWorkOrderGroup
 * .actionNeededCount) — the label is signal-list-agnostic (see actionBadgeLabel
 * in @medcal/shared), so adding a fourth/fifth signal never touches this.
 *
 * When `href` is set (first child with a workflow-available signal), the badge
 * navigates there without toggling the SPK row. Detail focuses an existing
 * section — it does not add a new action panel.
 */
export function ActionNeededBadge({ count, href }: { count: number; href?: string }) {
  const label = actionBadgeLabel(count);
  if (!label) return null;
  const badge = (
    <Badge variant="status" className="border-transparent bg-red-600 text-white hover:bg-red-600">
      {label}
    </Badge>
  );
  if (!href) return badge;
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex"
      title="Buka job yang memerlukan tindakan"
    >
      {badge}
    </Link>
  );
}

const JOB_CHILD_HEADER = [
  "Unit",
  "Declared Device",
  "Serial (observed)",
  "Declared AKD/AKL",
  "Approval",
  "Identity Correction",
  "Alat Referensi",
  "Job Status",
  "",
] as const;

/**
 * Inline "needs action" hint for a child job cell — quiet by design (icon +
 * colored text, no filled pill). The filled badge is reserved for the parent
 * SPK aggregate, which is what MT scans; child cells are detail seen only after
 * expanding.
 */
function ChildActionHint({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-red-600">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}

function JobChildRow({ row }: { row: CalibrationJobRow }) {
  return (
    <tr className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50">
      <td className="py-2.5 pl-10 pr-4 text-slate-500">
        {row.unitOrdinal} / {row.unitTotal}
      </td>
      <td className="px-4 py-2.5">
        <p className="text-slate-900">{declaredDeviceName(row)}</p>
        {resolvedDeviceType(row) ? (
          <p className="text-xs text-slate-400">{resolvedDeviceType(row)!.name}</p>
        ) : null}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
        {row.technicianObservedSerial ?? row.device?.serialNumber ?? "—"}
      </td>
      <td className="px-4 py-2.5 text-slate-600">{declaredAkdAkl(row)}</td>
      <td className="px-4 py-2.5">
        <AkdAklStatusBadge status={row.akdAklApprovalStatus} />
      </td>
      <td className="px-4 py-2.5">
        {row.actionSignals.identityCorrectionPending ? (
          <ChildActionHint label="Menunggu review" />
        ) : row.actionSignals.identityIncomplete ? (
          <ChildActionHint label="Identitas belum lengkap" />
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {row.actionSignals.referenceEquipmentNeedsApproval ? (
          <ChildActionHint label="Perlu persetujuan" />
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-col gap-1">
          <JobStatusBadge status={row.status} />
          {isAwaitingQualityReview(row) ? (
            <ChildActionHint label="Menunggu review" />
          ) : null}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        <Link
          href={
            jobNeedsAction(row.actionSignals)
              ? calibrationJobActionFocusHref(row.id)
              : `/calibration-jobs/${row.id}`
          }
        >
          <Button variant="ghost" size="sm">
            View
          </Button>
        </Link>
      </td>
    </tr>
  );
}

/**
 * Bucket the page's SPK groups by customer, preserving each customer's
 * first-appearance order and the server's SPK order within it. A customer whose
 * SPKs straddle a page boundary gets its header repeated on each page — an
 * accepted trade-off of SPK-level pagination.
 */
function groupByCustomer(groups: CalibrationJobWorkOrderGroup[]): {
  customer: CalibrationJobRow["workOrder"]["customer"];
  groups: CalibrationJobWorkOrderGroup[];
}[] {
  const order: string[] = [];
  const byCustomer = new Map<
    string,
    { customer: CalibrationJobRow["workOrder"]["customer"]; groups: CalibrationJobWorkOrderGroup[] }
  >();
  for (const group of groups) {
    const { customer } = group.workOrder;
    let bucket = byCustomer.get(customer.id);
    if (!bucket) {
      bucket = { customer, groups: [] };
      byCustomer.set(customer.id, bucket);
      order.push(customer.id);
    }
    bucket.groups.push(group);
  }
  return order.map((id) => byCustomer.get(id)!);
}

function SpkGroupBody({
  group,
  expanded,
  onToggle,
}: {
  group: CalibrationJobWorkOrderGroup;
  expanded: boolean;
  onToggle: (workOrderId: string) => void;
}) {
  return (
    <tbody className="border-b border-slate-200 last:border-0">
      <tr
        className="cursor-pointer bg-white hover:bg-slate-50"
        onClick={() => onToggle(group.workOrder.id)}
      >
        <td className="py-3 pl-6 pr-4" colSpan={9}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <span className="font-mono text-sm font-medium text-slate-900">
              {group.workOrder.number}
            </span>
            <span className="text-xs text-slate-400">{group.jobCount} perangkat</span>
            <ActionNeededBadge
              count={group.actionNeededCount}
              href={(() => {
                const jobId = firstActionableJobId(group.jobs);
                return jobId ? calibrationJobActionFocusHref(jobId) : undefined;
              })()}
            />
          </div>
        </td>
      </tr>
      {expanded ? (
        <>
          <tr className="bg-slate-50/70 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            {JOB_CHILD_HEADER.map((label, i) => (
              <td key={label || i} className={cn("px-4 py-1.5", i === 0 && "pl-10")}>
                {label}
              </td>
            ))}
          </tr>
          {group.jobs.map((row) => (
            <JobChildRow key={row.id} row={row} />
          ))}
        </>
      ) : null}
    </tbody>
  );
}

/**
 * SPK (WorkOrder)-grouped Calibration Jobs list, under a static (non-collapsible)
 * customer grouping header. Parent SPK row = one WorkOrder (collapsed by
 * default); child rows = its per-unit jobs. Collapse state and search
 * auto-expand are driven by the page client.
 */
export function CalibrationJobGroupTable({
  groups,
  expandedIds,
  onToggle,
}: {
  groups: CalibrationJobWorkOrderGroup[];
  expandedIds: Set<string>;
  onToggle: (workOrderId: string) => void;
}) {
  const customerGroups = groupByCustomer(groups);
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[1080px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5" colSpan={9}>
              Pelanggan / Work Order (SPK)
            </th>
          </tr>
        </thead>
        {customerGroups.map(({ customer, groups: spkGroups }) => (
          <CustomerSection
            key={customer.id}
            customer={customer}
            spkGroups={spkGroups}
            expandedIds={expandedIds}
            onToggle={onToggle}
          />
        ))}
      </table>
    </div>
  );
}

function CustomerSection({
  customer,
  spkGroups,
  expandedIds,
  onToggle,
}: {
  customer: CalibrationJobRow["workOrder"]["customer"];
  spkGroups: CalibrationJobWorkOrderGroup[];
  expandedIds: Set<string>;
  onToggle: (workOrderId: string) => void;
}) {
  return (
    <>
      <tbody>
        <tr className="border-b border-slate-200 bg-slate-200/60">
          <td className="px-4 py-2" colSpan={9}>
            <span className="text-sm font-semibold text-slate-800">{customer.name}</span>
            <span className="ml-2 text-xs font-normal text-slate-400">{spkGroups.length} SPK</span>
          </td>
        </tr>
      </tbody>
      {spkGroups.map((group) => (
        <SpkGroupBody
          key={group.workOrder.id}
          group={group}
          expanded={expandedIds.has(group.workOrder.id)}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

export function CalibrationJobEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        {onClearFilters
          ? "Tidak ada calibration job yang cocok dengan filter."
          : "Belum ada calibration job. Job dibuat otomatis saat Work Order dimulai (IN_PROGRESS)."}
      </p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}
