"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessDenied } from "../../../../components/access-denied";
import { buildUpdatePayload, formatCustomerApiError } from "../customer-form-utils";
import {
  type CustomerStatus,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_OPTIONS,
  CustomerStatusBadge,
  PageHeader,
  Surface,
  primaryContact,
  selectClassName,
} from "../customers-ui";
import { useCustomer, useUpdateCustomer } from "../use-customers-query";

const fieldClass = "mt-1.5 w-full";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const customerQuery = useCustomer(params.id);
  const updateMutation = useUpdateCustomer();

  const customer = customerQuery.data;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<CustomerStatus>("ACTIVE");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    const contact = primaryContact(customer);
    setName(customer.name);
    setLegalName(customer.legalName ?? "");
    setTaxId(customer.taxId ?? "");
    setAddress(customer.address ?? "");
    setStatus(customer.status);
    setContactName(contact?.name ?? "");
    setContactEmail(contact?.email ?? "");
    setContactPhone(contact?.phone ?? "");
    setContactTitle(contact?.title ?? "");
  }, [customer]);

  if (!capabilities?.customerRead) {
    return <AccessDenied />;
  }

  if (customerQuery.isLoading) {
    return (
      <div className="w-full px-4 py-6 md:px-6 md:py-6">
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(customerQuery.error)) {
    return <AccessDenied />;
  }

  if (customerQuery.error instanceof ApiError && customerQuery.error.status === 404) {
    return (
      <div className="w-full px-4 py-6 md:px-6 md:py-6">
        <PageHeader
          title="Customer tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/customers", label: "Customers" },
          ]}
        />
        <p className="mt-6 text-sm text-slate-600">Customer tidak ditemukan.</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="w-full px-4 py-6 md:px-6 md:py-6">
        <p className="text-sm text-red-600">Gagal memuat customer.</p>
      </div>
    );
  }

  const contact = primaryContact(customer);

  function resetForm() {
    const currentContact = primaryContact(customer!);
    setName(customer!.name);
    setLegalName(customer!.legalName ?? "");
    setTaxId(customer!.taxId ?? "");
    setAddress(customer!.address ?? "");
    setStatus(customer!.status);
    setContactName(currentContact?.name ?? "");
    setContactEmail(currentContact?.email ?? "");
    setContactPhone(currentContact?.phone ?? "");
    setContactTitle(currentContact?.title ?? "");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.customerUpdate) return;
    setError(null);
    setSuccess(null);

    try {
      await updateMutation.mutateAsync({
        id: customer!.id,
        input: buildUpdatePayload({
          name,
          legalName,
          taxId,
          address,
          status,
          contactName,
          contactEmail,
          contactPhone,
          contactTitle,
        }),
      });
      setSuccess("Changes saved.");
      setEditing(false);
      await customerQuery.refetch();
    } catch (err) {
      setError(formatCustomerApiError(err, "Failed to save changes."));
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader
        title={customer.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/customers", label: "Customers" },
          { label: customer.number },
        ]}
      />

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-4 text-sm text-emerald-700">{success}</p> : null}

      <Surface className="mt-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{customer.number}</p>
          {editing ? (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CustomerStatus)}
              className={`${selectClassName} min-w-[140px]`}
              aria-label="Status"
            >
              {CUSTOMER_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {CUSTOMER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <CustomerStatusBadge status={customer.status} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Name <span className="text-red-500">*</span>
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Legal name</label>
                <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Tax ID / NPWP</label>
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={fieldClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={`${selectClassName} ${fieldClass} min-h-[80px]`}
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold text-slate-900">Primary contact</h2>
              <p className="mt-1 text-xs text-slate-400">Optional — email is checked for duplicates within your company.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Contact name</label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Email</label>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Phone</label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={fieldClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Title</label>
                  <Input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} className={fieldClass} />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Name</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{customer.name}</dd>
              </div>
              {customer.legalName ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Legal name</dt>
                  <dd className="mt-0.5 text-slate-700">{customer.legalName}</dd>
                </div>
              ) : null}
              {customer.taxId ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Tax ID</dt>
                  <dd className="mt-0.5 text-slate-700">{customer.taxId}</dd>
                </div>
              ) : null}
              {customer.address ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Address</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{customer.address}</dd>
                </div>
              ) : null}
              {contact ? (
                <>
                  <div className="border-t border-slate-100 pt-3">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Contact</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{contact.name}</dd>
                  </div>
                  {contact.title ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Title</dt>
                      <dd className="mt-0.5 text-slate-700">{contact.title}</dd>
                    </div>
                  ) : null}
                  {contact.email ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Email</dt>
                      <dd className="mt-0.5">
                        <a href={`mailto:${contact.email}`} className="text-brand-800 underline">
                          {contact.email}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {contact.phone ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Phone</dt>
                      <dd className="mt-0.5 text-slate-700">{contact.phone}</dd>
                    </div>
                  ) : null}
                </>
              ) : null}
            </dl>

            {capabilities.customerUpdate ? (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Surface>

      <p className="mt-4 text-xs text-slate-400">
        Customer number <span className="font-mono">{customer.number}</span> is assigned by the system and cannot be
        changed.
      </p>
    </div>
  );
}
