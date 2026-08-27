"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  TaxFormFields,
  buildTaxCreatePayload,
  formatTaxApiError,
  percentInputToFraction,
  type TaxFormValue,
} from "../tax-form-fields";
import {
  PageHeader,
  Surface,
  taxFormActionsClass,
  taxFormPageClass,
  taxFormSurfaceClass,
} from "../tax-ui";
import { useCreateTax } from "../use-tax-query";

const emptyForm: TaxFormValue = {
  taxCode: "",
  description: "",
  taxRatePercent: "",
  isExclude: false,
};

export default function NewTaxPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateTax();

  const [form, setForm] = useState<TaxFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.taxManage) {
    return <AccessDenied />;
  }

  function setField<K extends keyof TaxFormValue>(field: K, next: TaxFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.taxCode.trim()) {
      setError("Kode tax wajib diisi.");
      return;
    }
    if (!form.description.trim()) {
      setError("Deskripsi tax wajib diisi.");
      return;
    }
    if (percentInputToFraction(form.taxRatePercent) == null) {
      setError("Tarif tax wajib diisi antara 0 dan 100.");
      return;
    }

    try {
      const tax = await createMutation.mutateAsync(buildTaxCreatePayload(form));
      setSuccess(`Tax ${tax.taxCode} berhasil dibuat.`);
      router.push(`/tax/${tax.id}`);
    } catch (err) {
      setError(formatTaxApiError(err));
    }
  }

  return (
    <div className={taxFormPageClass}>
      <PageHeader
        title="New Tax"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/tax", label: "Tax" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={taxFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <TaxFormFields value={form} onChange={setField} />

          <div className={taxFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/tax">Cancel</Link>
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
