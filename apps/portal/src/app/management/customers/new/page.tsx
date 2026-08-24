"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessDenied } from "../../../../components/access-denied";
import { buildCreatePayload, formatCustomerApiError } from "../customer-form-utils";
import { PageHeader, Surface, selectClassName } from "../customers-ui";
import { useCreateCustomer } from "../use-customers-query";

const fieldClass = "mt-1.5 w-full";

export default function NewCustomerPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateCustomer();

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.customerCreate) {
    return <AccessDenied />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError("Nama customer wajib diisi.");
      return;
    }

    try {
      const customer = await createMutation.mutateAsync(
        buildCreatePayload({
          name,
          legalName,
          taxId,
          address,
          contactName,
          contactEmail,
          contactPhone,
          contactTitle,
        }),
      );
      setSuccess(`Customer ${customer.number} berhasil dibuat.`);
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      setError(formatCustomerApiError(err, "Gagal membuat customer."));
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader
        title="New Customer"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/customers", label: "Customers" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className="mt-6 space-y-4 p-4 md:p-6">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

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
            <p className="mt-1 text-xs text-slate-400">
              Optional — email is checked for duplicates within your company.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Contact name</label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={fieldClass}
                />
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
