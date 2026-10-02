/**
 * Client view of the customer-scoped work-order APIs. Status codes are the
 * portal contract — the UI never renders the internal calibration-job enum.
 */
import type {
  CustomerCertificateFilterValue,
  CustomerJobStatusValue,
  CustomerProgressFilterValue,
  CustomerWorkOrderStatusValue,
} from "@medcal/shared";

export type CustomerJobStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type CustomerWorkOrderStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type CustomerCertificateAvailability = "UNAVAILABLE" | "AVAILABLE" | "ISSUED_WITHOUT_PDF";

export interface CustomerProgress {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  percentage: number;
}

export interface CustomerCertificate {
  availability: CustomerCertificateAvailability;
  number: string | null;
  issuedAt: string | null;
}

/** What identifies one unit to its owner. Any part may be unknown (null). */
export interface CustomerUnitIdentity {
  name: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
}

export interface CustomerJob {
  id: string;
  unitOrdinal: number;
  unitTotal: number;
  status: CustomerJobStatus;
  identity: CustomerUnitIdentity;
  certificate: CustomerCertificate;
}

export interface CustomerPage<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * One order line's units as the parent row of the grouped list. Counts cover
 * the units matching the current search/filters. `unit` is set for a group of
 * exactly one unit, shown as a plain card.
 */
export interface CustomerUnitGroup {
  key: string;
  name: string | null;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  availableCertificates: number;
  unit: CustomerJob | null;
}

export interface CustomerUnitGroupPage extends CustomerPage<CustomerUnitGroup> {
  totalUnits: number;
}

export interface CustomerWorkOrderSummary {
  id: string;
  number: string;
  status: CustomerWorkOrderStatus;
  progress: CustomerProgress;
  certificates: { availableCount: number };
}

export function workOrderStatusLabel(status: CustomerWorkOrderStatus): string {
  switch (status) {
    case "NOT_STARTED":
      return "Belum dimulai";
    case "IN_PROGRESS":
      return "Dalam proses";
    case "COMPLETED":
      return "Selesai";
    case "CANCELLED":
      return "Dibatalkan";
  }
}

export function jobStatusLabel(status: CustomerJobStatus): string {
  switch (status) {
    case "NOT_STARTED":
      return "Belum dimulai";
    case "IN_PROGRESS":
      return "Dalam proses";
    case "COMPLETED":
      return "Selesai";
  }
}

export function certificateAvailabilityLabel(availability: CustomerCertificateAvailability): string {
  switch (availability) {
    case "UNAVAILABLE":
      return "Belum tersedia";
    case "AVAILABLE":
      return "Tersedia";
    case "ISSUED_WITHOUT_PDF":
      return "Terbit, PDF belum tersedia";
  }
}

export function certificateCountLabel(count: number): string {
  if (count === 0) return "Belum ada sertifikat";
  if (count === 1) return "1 sertifikat tersedia";
  return `${count} sertifikat tersedia`;
}

/** "Unit 2 dari 94" — the position within the same line of the order, not a unique id. */
export function formatUnitLabel(unitOrdinal: number, unitTotal: number): string {
  return `Unit ${unitOrdinal} dari ${Math.max(unitTotal, unitOrdinal)}`;
}

export const UNNAMED_DEVICE_LABEL = "Alat tanpa nama";

export function unitTitle(identity: CustomerUnitIdentity): string {
  return identity.name ?? UNNAMED_DEVICE_LABEL;
}

/**
 * The identity lines under a unit's name, in display order: brand, model, then
 * serial number. A value that is unknown simply has no line — never a dash or
 * placeholder.
 */
export function unitDetailLines(identity: CustomerUnitIdentity): string[] {
  return [
    identity.brand,
    identity.model,
    identity.serialNumber ? `No. seri: ${identity.serialNumber}` : null,
  ].filter((line): line is string => Boolean(line));
}

/** "94 unit" */
export function groupUnitLabel(total: number): string {
  return `${formatCount(total)} unit`;
}

/** "42 selesai · 35 dalam proses · 17 belum dimulai", leaving out zero counts. */
export function groupStatusSummary(group: Pick<CustomerUnitGroup, "completed" | "inProgress" | "notStarted">): string {
  return [
    group.completed > 0 ? `${formatCount(group.completed)} selesai` : null,
    group.inProgress > 0 ? `${formatCount(group.inProgress)} dalam proses` : null,
    group.notStarted > 0 ? `${formatCount(group.notStarted)} belum dimulai` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** "1 sertifikat tersedia", or null when there is none (the header then shows nothing). */
export function groupCertificateLabel(availableCertificates: number): string | null {
  return availableCertificates > 0 ? certificateCountLabel(availableCertificates) : null;
}

export function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("id-ID");
}

// ---------------------------------------------------------------------------
// List filters: the value lists come from @medcal/shared (the API contract);
// the labels are the customer-facing wording.
// ---------------------------------------------------------------------------

export interface FilterOption<T extends string> {
  value: T | "";
  label: string;
}

export const WORK_ORDER_STATUS_OPTIONS: FilterOption<CustomerWorkOrderStatusValue>[] = [
  { value: "", label: "Semua status" },
  { value: "NOT_STARTED", label: workOrderStatusLabel("NOT_STARTED") },
  { value: "IN_PROGRESS", label: workOrderStatusLabel("IN_PROGRESS") },
  { value: "COMPLETED", label: workOrderStatusLabel("COMPLETED") },
  { value: "CANCELLED", label: workOrderStatusLabel("CANCELLED") },
];

export const JOB_STATUS_OPTIONS: FilterOption<CustomerJobStatusValue>[] = [
  { value: "", label: "Semua status" },
  { value: "NOT_STARTED", label: jobStatusLabel("NOT_STARTED") },
  { value: "IN_PROGRESS", label: jobStatusLabel("IN_PROGRESS") },
  { value: "COMPLETED", label: jobStatusLabel("COMPLETED") },
];

export const PROGRESS_OPTIONS: FilterOption<CustomerProgressFilterValue>[] = [
  { value: "", label: "Semua progres" },
  { value: "NONE_COMPLETED", label: "Belum ada unit selesai" },
  { value: "PARTIALLY_COMPLETED", label: "Sebagian unit selesai" },
  { value: "ALL_COMPLETED", label: "Semua unit selesai" },
];

export const CERTIFICATE_OPTIONS: FilterOption<CustomerCertificateFilterValue>[] = [
  { value: "", label: "Semua sertifikat" },
  { value: "AVAILABLE", label: "Sertifikat tersedia" },
];

/** Narrows an untrusted URL value to one of the allowed values, else "" (no filter). */
export function pickFilterValue<T extends string>(raw: string | undefined, allowed: readonly T[]): T | "" {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : "";
}

export function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export interface WorkOrderListParams {
  search: string;
  status: CustomerWorkOrderStatusValue | "";
  progress: CustomerProgressFilterValue | "";
  certificate: CustomerCertificateFilterValue | "";
  page: number;
}

export interface JobListParams {
  search: string;
  status: CustomerJobStatusValue | "";
  certificate: CustomerCertificateFilterValue | "";
  page: number;
  /** Opaque group key from a unit-groups response; narrows the list to that group. */
  group?: string;
}

export type UnitGroupListParams = Omit<JobListParams, "group">;

function toQueryString(entries: Array<[string, string | number | undefined]>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `?${text}` : "";
}

/** Only non-empty filters are sent; page 1 is the server default. No customer id is ever part of the request. */
export function workOrderListPath(params: WorkOrderListParams): string {
  return `/customer/work-orders${toQueryString([
    ["search", params.search.trim()],
    ["status", params.status],
    ["progress", params.progress],
    ["certificate", params.certificate],
    ["page", params.page > 1 ? params.page : undefined],
  ])}`;
}

export function jobListPath(workOrderId: string, params: JobListParams): string {
  return `/customer/work-orders/${encodeURIComponent(workOrderId)}/jobs${toQueryString([
    ["search", params.search.trim()],
    ["status", params.status],
    ["certificate", params.certificate],
    ["group", params.group],
    ["page", params.page > 1 ? params.page : undefined],
  ])}`;
}

export function unitGroupListPath(workOrderId: string, params: UnitGroupListParams): string {
  return `/customer/work-orders/${encodeURIComponent(workOrderId)}/unit-groups${toQueryString([
    ["search", params.search.trim()],
    ["status", params.status],
    ["certificate", params.certificate],
    ["page", params.page > 1 ? params.page : undefined],
  ])}`;
}

export function hasActiveFilters(params: { search: string; status: string; certificate: string; progress?: string }): boolean {
  return Boolean(params.search.trim() || params.status || params.certificate || params.progress);
}
