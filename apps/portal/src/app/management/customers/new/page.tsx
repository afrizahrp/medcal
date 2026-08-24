"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { CustomerFormFields, type CustomerFormFieldsValue } from "../customer-form-fields";
import { buildCreatePayload, formatCustomerApiError } from "../customer-form-utils";
import { PageHeader, Surface, customerFormActionsClass, customerFormPageClass, customerFormSurfaceClass } from "../customers-ui";
import { useCreateCustomer } from "../use-customers-query";

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

export default function NewCustomerPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateCustomer();

  const [form, setForm] = useState<CustomerFormFieldsValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.customerCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof CustomerFormFieldsValue>(
    field: K,
    next: CustomerFormFieldsValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Nama customer wajib diisi.");
      return;
    }

    try {
      const customer = await createMutation.mutateAsync(buildCreatePayload(form));
      setSuccess(`Customer ${customer.number} berhasil dibuat.`);
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      setError(formatCustomerApiError(err, "Gagal membuat customer."));
    }
  }

  return (
    <div className={customerFormPageClass}>
      <PageHeader
        title="New Customer"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/customers", label: "Customers" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={customerFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <CustomerFormFields value={form} onChange={setField} />

          <div className={customerFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/customers">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
