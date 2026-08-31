"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  EquipmentTypeFormFields,
  buildEquipmentTypeCreatePayload,
  formatEquipmentTypeApiError,
  type EquipmentTypeFormValue,
} from "../equipment-type-form-fields";
import {
  PageHeader,
  Surface,
  equipmentTypeFormActionsClass,
  equipmentTypeFormPageClass,
  equipmentTypeFormSurfaceClass,
} from "../equipment-types-ui";
import { useCreateEquipmentType } from "../use-equipment-types-query";

const emptyForm: EquipmentTypeFormValue = {
  code: "",
  name: "",
  description: "",
  category: "",
};

export default function NewEquipmentTypePage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateEquipmentType();

  const [form, setForm] = useState<EquipmentTypeFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.equipmentTypeCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof EquipmentTypeFormValue>(
    field: K,
    next: EquipmentTypeFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Nama Equipment Type wajib diisi.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildEquipmentTypeCreatePayload(form));
      setSuccess(`Equipment Type ${row.code} berhasil dibuat.`);
      router.push(`/equipment-types/${row.id}`);
    } catch (err) {
      setError(formatEquipmentTypeApiError(err));
    }
  }

  return (
    <div className={equipmentTypeFormPageClass}>
      <PageHeader
        title="New Equipment Type"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/equipment-types", label: "Equipment Type" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={equipmentTypeFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <EquipmentTypeFormFields value={form} onChange={setField} />

          <div className={equipmentTypeFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/equipment-types">Cancel</Link>
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
