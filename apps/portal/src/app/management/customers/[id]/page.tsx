"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { CustomerFormFields, type CustomerFormFieldsValue } from "../customer-form-fields";
import { buildUpdatePayload, formatCustomerApiError } from "../customer-form-utils";
import {
  type CustomerRow,
  type CustomerStatus,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_OPTIONS,
  CustomerStatusBadge,
  PageHeader,
  Surface,
  customerFormActionsClass,
  customerFormPageClass,
  customerFormSurfaceClass,
  primaryContact,
  selectClassName,
} from "../customers-ui";
import { useCustomer, useUpdateCustomer } from "../use-customers-query";

const emptyForm: CustomerFormFieldsValue = {
  name: "",
  legalName: "",
  taxId: "",
  address: "",
  phone: "",
  mobile: "",
  email: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  contactTitle: "",
};

function formFromCustomer(customer: CustomerRow): CustomerFormFieldsValue {
  const contact = primaryContact(customer);
  return {
    name: customer.name,
    legalName: customer.legalName ?? "",
    taxId: customer.taxId ?? "",
    address: customer.address ?? "",
    phone: customer.phone ?? "",
    mobile: customer.mobile ?? "",
    email: customer.email ?? "",
    contactName: contact?.name ?? "",
    contactEmail: contact?.email ?? "",
    contactPhone: contact?.phone ?? "",
    contactTitle: contact?.title ?? "",
  };
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const customerQuery = useCustomer(params.id);
  const updateMutation = useUpdateCustomer();

  const customer = customerQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CustomerFormFieldsValue>(emptyForm);
  const [status, setStatus] = useState<CustomerStatus>("ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    setForm(formFromCustomer(customer));
    setStatus(customer.status);
  }, [customer]);

  if (!capabilities?.customerRead) {
    return <AccessDenied />;
  }

  if (customerQuery.isLoading) {
    return (
      <div className={customerFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(customerQuery.error)) {
    return <AccessDenied />;
  }

  if (customerQuery.error instanceof ApiError && customerQuery.error.status === 404) {
    return (
      <div className={customerFormPageClass}>
        <PageHeader
          title="Customer tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/customers", label: "Customers" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Customer tidak ditemukan.</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className={customerFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat customer.</p>
      </div>
    );
  }

  const contact = primaryContact(customer);

  function setField<K extends keyof CustomerFormFieldsValue>(
    field: K,
    next: CustomerFormFieldsValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromCustomer(customer!));
    setStatus(customer!.status);
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
        input: buildUpdatePayload({ ...form, status }),
      });
      setSuccess("Changes saved.");
      setEditing(false);
      await customerQuery.refetch();
    } catch (err) {
      setError(formatCustomerApiError(err, "Failed to save changes."));
    }
  }

  return (
    <div className={customerFormPageClass}>
      <PageHeader
        title={customer.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/customers", label: "Customers" },
          { label: customer.number },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={customerFormSurfaceClass}>
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
          <form onSubmit={save} className="mt-3">
            <CustomerFormFields value={form} onChange={setField} />

            <div className={customerFormActionsClass}>
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
            <dl className="mt-3 space-y-3 text-sm">
              <DetailField label="Name">
                <span className="font-medium text-slate-900">{customer.name}</span>
              </DetailField>

              {(customer.legalName || customer.taxId) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {customer.legalName ? (
                    <DetailField label="Legal name">{customer.legalName}</DetailField>
                  ) : (
                    <div />
                  )}
                  {customer.taxId ? <DetailField label="Tax ID">{customer.taxId}</DetailField> : null}
                </div>
              )}

              {customer.address ? (
                <DetailField label="Address">
                  <span className="whitespace-pre-wrap">{customer.address}</span>
                </DetailField>
              ) : null}

              {(customer.phone || customer.mobile) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {customer.phone ? <DetailField label="Phone">{customer.phone}</DetailField> : <div />}
                  {customer.mobile ? <DetailField label="Mobile">{customer.mobile}</DetailField> : null}
                </div>
              )}

              {customer.email ? (
                <DetailField label="Email">
                  <a href={`mailto:${customer.email}`} className="text-brand-800 underline">
                    {customer.email}
                  </a>
                </DetailField>
              ) : null}

              {contact ? (
                <>
                  <div className="border-t border-slate-100 pt-5">
                    <DetailField label="Contact">
                      <span className="font-medium text-slate-900">{contact.name}</span>
                    </DetailField>
                  </div>
                  {(contact.email || contact.phone) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {contact.email ? (
                        <DetailField label="Email">
                          <a href={`mailto:${contact.email}`} className="text-brand-800 underline">
                            {contact.email}
                          </a>
                        </DetailField>
                      ) : (
                        <div />
                      )}
                      {contact.phone ? <DetailField label="Phone">{contact.phone}</DetailField> : null}
                    </div>
                  )}
                  {/* {contact.title ? <DetailField label="Title">{contact.title}</DetailField> : null} */}
                </>
              ) : null}
            </dl>

            {capabilities.customerUpdate ? (
              <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Surface>

      <p className="mt-3 text-xs text-slate-400">
        Customer number <span className="font-mono">{customer.number}</span> is assigned by the system and cannot be
        changed.
      </p>
    </div>
  );
}
