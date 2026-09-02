"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import { ConfirmDialog, DetailField } from "../calibration-requests/calibration-requests-ui";
import { formPageClass, formSurfaceClass, formatDateTime } from "../quotations/quotations-ui";
import {
  AKD_AKL_APPROVAL_STATUS_LABELS,
  AKD_AKL_APPROVAL_STATUS_VALUES,
  CALIBRATION_JOB_STATUS_LABELS,
  CALIBRATION_JOB_STATUS_VALUES,
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
  formatDateTime,
};

// ── API row types (mirror CalibrationJobDetail from calibration-jobs.service) ──

export interface CalibrationJobDeviceTypeRef {
  id: string;
  code: string;
  name: string;
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
  workOrder: { id: string; number: string; status: string; customerId: string };
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
}

export interface CalibrationJobListResponse {
  data: CalibrationJobRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

export interface DeviceAssignmentResult {
  job: CalibrationJobRow;
  deviceTypeValidated: boolean;
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

const badgeBase = "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

export function AkdAklStatusBadge({ status }: { status: AkdAklApprovalStatus }) {
  return (
    <Badge className={cn(badgeBase, AKD_AKL_BADGE_CLASS[status])}>
      {AKD_AKL_APPROVAL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: CalibrationJobStatus }) {
  return (
    <Badge className={cn(badgeBase, JOB_STATUS_BADGE_CLASS[status])}>
      {CALIBRATION_JOB_STATUS_LABELS[status]}
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

export function CalibrationJobTable({ jobs }: { jobs: CalibrationJobRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Work Order</th>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Declared Device</th>
            <th className="px-4 py-3">Serial (observed)</th>
            <th className="px-4 py-3">Declared AKD/AKL</th>
            <th className="px-4 py-3">Approval</th>
            <th className="px-4 py-3">Job Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.workOrder.number}</td>
              <td className="px-4 py-3 text-sm text-slate-500">
                {row.unitOrdinal} / {row.unitTotal}
              </td>
              <td className="px-4 py-3">
                <p className="text-sm text-slate-900">{declaredDeviceName(row)}</p>
                {resolvedDeviceType(row) ? (
                  <p className="text-xs text-slate-400">{resolvedDeviceType(row)!.name}</p>
                ) : null}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {row.technicianObservedSerial ?? row.device?.serialNumber ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{declaredAkdAkl(row)}</td>
              <td className="px-4 py-3">
                <AkdAklStatusBadge status={row.akdAklApprovalStatus} />
              </td>
              <td className="px-4 py-3">
                <JobStatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/calibration-jobs/${row.id}`}>
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
