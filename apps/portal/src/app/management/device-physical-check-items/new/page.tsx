"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DevicePhysicalCheckItemFormFields,
  buildDevicePhysicalCheckItemCreatePayload,
  formatDevicePhysicalCheckItemApiError,
  validateDevicePhysicalCheckItemForm,
  type DevicePhysicalCheckItemFormValue,
} from "../device-physical-check-item-form-fields";
import {
  PageHeader,
  Surface,
  devicePhysicalCheckItemFormActionsClass,
  devicePhysicalCheckItemFormPageClass,
  devicePhysicalCheckItemFormSurfaceClass,
} from "../device-physical-check-items-ui";
import { useCreateDevicePhysicalCheckItem } from "../use-device-physical-check-items-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";

const emptyForm: DevicePhysicalCheckItemFormValue = {
  deviceTypeId: "",
  code: "",
  name: "",
  inspectionLimit: "",
};

function NewDevicePhysicalCheckItemPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDevicePhysicalCheckItem();
  const [form, setForm] = useState<DevicePhysicalCheckItemFormValue>(() => ({
    ...emptyForm,
    deviceTypeId: searchParams.get("deviceTypeId") ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  if (!capabilities?.devicePhysicalCheckItemCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DevicePhysicalCheckItemFormValue>(
    field: K,
    next: DevicePhysicalCheckItemFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateDevicePhysicalCheckItemForm(form, "create");
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildDevicePhysicalCheckItemCreatePayload(form));
      setSuccess(`Physical Inspection ${row.name} berhasil dibuat.`);
      router.push(`/device-physical-check-items/${row.id}`);
    } catch (err) {
      setError(formatDevicePhysicalCheckItemApiError(err));
    }
  }

  return (
    <div className={devicePhysicalCheckItemFormPageClass}>
      <PageHeader
        title="New Physical Inspection"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-physical-check-items", label: "Physical Inspection" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={devicePhysicalCheckItemFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DevicePhysicalCheckItemFormFields
            value={form}
            onChange={setField}
            mode="create"
            deviceTypes={typesQuery.data?.data ?? []}
            deviceTypesLoading={typesQuery.isLoading}
          />

          <div className={devicePhysicalCheckItemFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/device-physical-check-items">Cancel</Link>
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

export default function NewDevicePhysicalCheckItemPage() {
  return (
    <Suspense
      fallback={
        <div className={devicePhysicalCheckItemFormPageClass}>
          <p className="text-sm text-slate-400">Memuat…</p>
        </div>
      }
    >
      <NewDevicePhysicalCheckItemPageInner />
    </Suspense>
  );
}
