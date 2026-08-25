"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  UomFormFields,
  buildUomCreatePayload,
  formatUomApiError,
  type UomFormValue,
} from "../uom-form-fields";
import {
  PageHeader,
  Surface,
  uomFormActionsClass,
  uomFormPageClass,
  uomFormSurfaceClass,
} from "../uoms-ui";
import { useCreateUom } from "../use-uoms-query";

const emptyForm: UomFormValue = {
  code: "",
  name: "",
  symbol: "",
  category: "",
};

export default function NewUomPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateUom();

  const [form, setForm] = useState<UomFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.uomCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof UomFormValue>(field: K, next: UomFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.code.trim()) {
      setError("Kode UOM wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama UOM wajib diisi.");
      return;
    }
    if (!form.symbol.trim()) {
      setError("Simbol UOM wajib diisi.");
      return;
    }
    if (!form.category) {
      setError("Kategori UOM wajib dipilih.");
      return;
    }

    try {
      const uom = await createMutation.mutateAsync(buildUomCreatePayload(form));
      setSuccess(`UOM ${uom.code} berhasil dibuat.`);
      router.push(`/uoms/${uom.id}`);
    } catch (err) {
      setError(formatUomApiError(err));
    }
  }

  return (
    <div className={uomFormPageClass}>
      <PageHeader
        title="New UOM"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/uoms", label: "UOM" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={uomFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <UomFormFields value={form} onChange={setField} />

          <div className={uomFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/uoms">Cancel</Link>
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
