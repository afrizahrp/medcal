"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";

export type CustomerStatus = "ACTIVE" | "INACTIVE";

export interface CustomerContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
}

export interface CustomerRow {
  id: string;
  companyId: string;
  number: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  contacts: CustomerContact[];
}

export interface CustomerListResponse {
  data: CustomerRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LeadConvertResponse {
  customer: CustomerRow;
  lead: {
    id: string;
    customerId: string | null;
    status: string;
  };
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
};

export const CUSTOMER_STATUS_OPTIONS: CustomerStatus[] = ["ACTIVE", "INACTIVE"];

/** Shared page shell for /customers/new and /customers/[id] form views. */
export const customerFormPageClass = "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";

/** Shared card padding for customer create/edit forms. */
export const customerFormSurfaceClass = "mt-5 p-4 md:p-5";

/** Shared action row below customer form fields. */
export const customerFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName };

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <Badge
      variant={status === "ACTIVE" ? "default" : "secondary"}
      className={cn(
        "font-medium",
        status === "ACTIVE"
          ? "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
          : "text-slate-600",
      )}
    >
      {CUSTOMER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function primaryContact(customer: CustomerRow): CustomerContact | undefined {
  return customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
}

export function CustomerFilters({
  searchInput,
  onSearchChange,
  status,
  onStatusChange,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: CustomerStatus | "";
  onStatusChange: (value: CustomerStatus | "") => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nomor atau nama…"
          className="pl-9"
          aria-label="Cari customer"
        />
      </div>
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as CustomerStatus | "")}
        className={cn(selectClassName, "w-full sm:w-44")}
        aria-label="Filter status"
      >
        <option value="">Semua status</option>
        {CUSTOMER_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {CUSTOMER_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CustomerTable({ customers }: { customers: CustomerRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Nomor</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {customers.map((customer) => (
              <tr key={customer.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{customer.number}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{customer.name}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{customer.phone ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{customer.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <CustomerStatusBadge status={customer.status} />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/customers/${customer.id}`}>
                    <Button variant="ghost" size="sm">
                      Edit
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

export function CustomerEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">Belum ada customer yang cocok dengan filter.</p>
      {onClearFilters ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

export { PaginationBar };
