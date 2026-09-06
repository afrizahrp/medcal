"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SortableTh } from "@/components/ui/sortable-th";
import type { TableSort } from "@/hooks/use-table-sort";
import { PaginationBar, Surface, formatRelativeTime, selectClassName } from "../leads/leads-ui";
import { ConfirmDialog, DetailField } from "../calibration-requests/calibration-requests-ui";
import {
  SERVICE_MODE_LABELS,
  ServiceModeBadge,
  type ServiceMode,
} from "../calibration-requests/calibration-requests-ui";
import {
  PageHeader,
  formatDateTime,
  formatQty,
  quotationPdfFilename,
  type MoneyValue,
  type QuotationCustomer,
} from "../quotations/quotations-ui";
import { fmtDateOnly } from "@/lib/date-utils";
import {
  deviceIdentifierFromItem,
  type AssignmentRole,
  type WorkOrderStatus,
  WORK_ORDER_STATUS_VALUES,
} from "./work-order-form-utils";

export type { WorkOrderStatus, AssignmentRole };

export interface WorkOrderTechnician {
  id: string;
  name: string | null;
  email: string;
  status: string;
}

export interface WorkOrderAssignment {
  id: string;
  technicianUserId: string;
  roleOnJob: AssignmentRole;
  createdAt: string;
  technician: WorkOrderTechnician;
}

export interface WorkOrderItem {
  id: string;
  purchaseOrderItemId: string;
  description: string;
  qty: MoneyValue;
  createdAt: string;
  purchaseOrderItem: {
    id: string;
    quotationItemId: string;
    deviceId: string | null;
    description: string;
    qty: MoneyValue;
    quotationItem: {
      id: string;
      requestItemId: string | null;
      requestItem: {
        deviceId: string;
        deviceType: { id: string; code: string; name: string };
      } | null;
    };
    device: {
      id: string;
      brand: string | null;
      model: string | null;
      serialNumber: string | null;
    } | null;
  };
}

export interface WorkOrderEquipmentTypeRef {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

export interface WorkOrderEquipmentRow {
  id: string;
  equipmentTypeId: string;
  sortOrder: number;
  notes: string | null;
  equipment: {
    id: string;
    code: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    isActive: boolean;
    equipmentType: WorkOrderEquipmentTypeRef;
  };
}

export interface WorkOrderEquipmentCandidate {
  id: string;
  code: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  equipmentTypeId: string;
  calibrationStatus: "VALID" | "EXPIRED" | "NOT_YET_VALID" | "NO_RECORD";
  validUntil: string | null;
}

export interface WorkOrderEquipmentProposalRow {
  equipmentType: WorkOrderEquipmentTypeRef;
  sortOrder: number;
  coveredFromDeviceTypeId: string;
  candidates: WorkOrderEquipmentCandidate[];
  selectedEquipmentId: string | null;
}

export interface WorkOrderEquipmentProposalResponse {
  serviceMode: ServiceMode;
  proposal: WorkOrderEquipmentProposalRow[];
}

export interface WorkOrderDeliveryNoteItem {
  id: string;
  equipmentId: string;
  equipmentName: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  sortOrder: number;
}

export type WorkOrderDeliveryNoteStatus = "ISSUED" | "CANCELLED";

export interface WorkOrderDeliveryNote {
  id: string;
  number: string;
  status: WorkOrderDeliveryNoteStatus;
  issuedAt: string;
  workOrderNumber: string;
  customerName: string;
  customerAddress: string | null;
  locationText: string | null;
  createdAt: string;
  items: WorkOrderDeliveryNoteItem[];
}

export interface WorkOrderRow {
  id: string;
  companyId: string;
  customerId: string;
  quotationId: string;
  purchaseOrderId: string;
  number: string;
  serviceMode: ServiceMode;
  addressText: string | null;
  geoLat: number | null;
  geoLng: number | null;
  locationNotes: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: WorkOrderStatus;
  equipmentConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: WorkOrderItem[];
  equipment: WorkOrderEquipmentRow[];
  deliveryNote: WorkOrderDeliveryNote | null;
  customer: QuotationCustomer;
  purchaseOrder: {
    id: string;
    number: string;
    status: string;
    customerPoNumber: string;
    quotationId: string;
  } | null;
  quotation: {
    id: string;
    number: string;
    status: string;
    requestId: string;
    customerId: string;
    request: { id: string; number: string; serviceMode: ServiceMode } | null;
  };
  assignments: WorkOrderAssignment[];
}

export interface WorkOrderListResponse {
  data: WorkOrderRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const STATUS_OPTIONS: WorkOrderStatus[] = WORK_ORDER_STATUS_VALUES;

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  LEAD: "Lead",
  ASSIST: "Assist",
};

const STATUS_BADGE_CLASS: Record<WorkOrderStatus, string> = {
  PLANNED: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
  ASSIGNED: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
  IN_PROGRESS: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  DONE: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  CANCELLED: "border-transparent bg-slate-400 text-white hover:bg-slate-400",
};

export {
  PageHeader,
  Surface,
  selectClassName,
  PaginationBar,
  ConfirmDialog,
  DetailField,
  ServiceModeBadge,
  SERVICE_MODE_LABELS,
  formatDateTime,
};

export function workOrderPdfFilenameForRow(
  workOrder: Pick<WorkOrderRow, "number" | "companyId" | "createdAt">,
): string {
  return quotationPdfFilename({
    number: workOrder.number,
    companyId: workOrder.companyId,
    issuedAt: workOrder.createdAt,
  });
}

export function StatusBadge({ status }: { status: string }) {
  const known = STATUS_OPTIONS.includes(status as WorkOrderStatus)
    ? (status as WorkOrderStatus)
    : null;
  const label = known ? STATUS_LABELS[known] : status;
  const badgeClass = known ? STATUS_BADGE_CLASS[known] : STATUS_BADGE_CLASS.PLANNED;
  return (
    <Badge
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        badgeClass,
      )}
    >
      {label}
    </Badge>
  );
}

export function WorkOrderFilters({
  searchInput,
  onSearchChange,
  status,
  onStatusChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: WorkOrderStatus | "";
  onStatusChange: (value: WorkOrderStatus | "") => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nomor SPK, customer, PO, atau quotation…"
          className="pl-9"
          aria-label="Cari work order"
        />
      </div>
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as WorkOrderStatus | "")}
        className={cn(selectClassName, "w-full sm:w-44")}
        aria-label="Filter status"
      >
        <option value="">Semua status</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function WorkOrderTable({
  workOrders,
  sort,
}: {
  workOrders: WorkOrderRow[];
  sort: TableSort;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <SortableTh field="number" label="Work Order" sort={sort} />
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Purchase Order</th>
            <th className="px-4 py-3">Quotation</th>
            <th className="px-4 py-3">Service Mode</th>
            <SortableTh field="status" label="Status" sort={sort} />
            <th className="px-4 py-3">Scheduled Start</th>
            <SortableTh field="createdAt" label="Created At" sort={sort} />
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {workOrders.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.number}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{row.customer.name}</p>
                <p className="text-xs text-slate-400">{row.customer.number}</p>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {row.purchaseOrder?.number ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.quotation.number}</td>
              <td className="px-4 py-3">
                <ServiceModeBadge mode={row.serviceMode} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3 text-sm text-slate-500">
                {fmtDateOnly(row.scheduledStart)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-500">
                {formatRelativeTime(row.createdAt)}
              </td>
              <td className="px-4 py-3">
                <Link href={`/work-orders/${row.id}`}>
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

export function WorkOrderEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        {onClearFilters
          ? "Belum ada work order yang cocok dengan filter."
          : "Belum ada work order. Buat SPK dari Purchase Order yang sudah di-approve."}
      </p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export function WorkOrderItemsTable({ items }: { items: WorkOrderItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Work Order Items ({items.length})</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Device</th>
              <th className="px-3 py-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const device = deviceIdentifierFromItem(item);
              return (
                <tr key={item.id}>
                  <td className="px-3 py-3">
                    <p className="text-sm text-slate-900">{item.description}</p>
                  </td>
                  <td className="px-3 py-3">
                    {device.deviceTypeName ? (
                      <p className="text-sm text-slate-700">{device.deviceTypeName}</p>
                    ) : null}
                    <p className="font-mono text-xs text-slate-500">{device.identifier ?? "—"}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-slate-600">
                    {formatQty(item.qty)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
