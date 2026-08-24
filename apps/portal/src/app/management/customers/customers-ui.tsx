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
          placeholder="Cari nomor, nama, atau legal name…"
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
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3">Nomor</th>
            <th className="py-2 pr-3">Nama</th>
            <th className="py-2 pr-3">Legal name</th>
            <th className="py-2 pr-3">Tax ID</th>
            <th className="py-2 pr-3">Kontak</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => {
            const contact = primaryContact(customer);
            return (
              <tr key={customer.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">{customer.number}</td>
                <td className="py-2.5 pr-3">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium text-brand-800 underline hover:text-brand-900"
                  >
                    {customer.name}
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-slate-600">{customer.legalName ?? "—"}</td>
                <td className="py-2.5 pr-3 text-slate-600">{customer.taxId ?? "—"}</td>
                <td className="py-2.5 pr-3 text-slate-600">
                  {contact ? (
                    <span>
                      {contact.name}
                      {contact.email ? (
                        <span className="block text-xs text-slate-400">{contact.email}</span>
                      ) : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5">
                  <CustomerStatusBadge status={customer.status} />
                </td>
              </tr>
            );
          })}
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
