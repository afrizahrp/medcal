"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceModelFormFields,
  buildDeviceModelCreatePayload,
  formatDeviceModelApiError,
  type DeviceModelFormValue,
} from "../device-model-form-fields";
import {
  PageHeader,
  Surface,
  deviceModelFormActionsClass,
  deviceModelFormPageClass,
  deviceModelFormSurfaceClass,
} from "../device-models-ui";
import { useCreateDeviceModel } from "../use-device-models-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";

const emptyForm: DeviceModelFormValue = {
  deviceTypeId: "",
  manufacturer: "",
  model: "",
  description: "",
};

export default function NewDeviceModelPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDeviceModel();
  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const [form, setForm] = useState<DeviceModelFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.deviceModelCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DeviceModelFormValue>(field: K, next: DeviceModelFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.deviceTypeId) {
      setError("Device Name wajib dipilih.");
      return;
    }
    if (!form.manufacturer.trim()) {
      setError("Manufacturer wajib diisi.");
      return;
    }
    if (!form.model.trim()) {
      setError("Model wajib diisi.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildDeviceModelCreatePayload(form));
      setSuccess(`Device Model ${row.manufacturer} ${row.model} berhasil dibuat.`);
      router.push(`/device-models/${row.id}`);
    } catch (err) {
      setError(formatDeviceModelApiError(err));
    }
  }

  return (
    <div className={deviceModelFormPageClass}>
      <PageHeader
        title="New Device Model"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-models", label: "Device Model" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={deviceModelFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DeviceModelFormFields
            value={form}
            onChange={setField}
            deviceTypes={typesQuery.data?.data ?? []}
            deviceTypesLoading={typesQuery.isLoading}
          />

          <div className={deviceModelFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/device-models">Cancel</Link>
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
