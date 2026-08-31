"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  EquipmentUnitFormFields,
  buildEquipmentUnitCreatePayload,
  formatEquipmentUnitApiError,
  type EquipmentUnitFormValue,
} from "../equipment-unit-form-fields";
import {
  PageHeader,
  Surface,
  equipmentUnitFormActionsClass,
  equipmentUnitFormPageClass,
  equipmentUnitFormSurfaceClass,
} from "../equipment-units-ui";
import {
  useCreateEquipmentUnit,
  useEquipmentTypeOptions,
} from "../use-equipment-units-query";

const emptyForm: EquipmentUnitFormValue = {
  equipmentTypeId: "",
  brand: "",
  model: "",
  serialNumber: "",
  notes: "",
};

export default function NewEquipmentUnitPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateEquipmentUnit();
  const optionsQuery = useEquipmentTypeOptions(Boolean(capabilities?.equipmentCreate));

  const [form, setForm] = useState<EquipmentUnitFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const equipmentTypeOptions = useMemo(
    () =>
      (optionsQuery.data?.data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
      })),
    [optionsQuery.data],
  );

  if (!capabilities?.equipmentCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof EquipmentUnitFormValue>(
    field: K,
    next: EquipmentUnitFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.equipmentTypeId) {
      setError("Equipment Type wajib dipilih.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildEquipmentUnitCreatePayload(form));
      setSuccess(`Equipment Unit ${row.code} berhasil dibuat.`);
      router.push(`/equipment-units/${row.id}`);
    } catch (err) {
      setError(formatEquipmentUnitApiError(err));
    }
  }

  return (
    <div className={equipmentUnitFormPageClass}>
      <PageHeader
        title="New Equipment Unit"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/equipment-units", label: "Equipment Unit" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={equipmentUnitFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <EquipmentUnitFormFields
            value={form}
            onChange={setField}
            equipmentTypeOptions={equipmentTypeOptions}
          />

          <div className={equipmentUnitFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/equipment-units">Cancel</Link>
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
