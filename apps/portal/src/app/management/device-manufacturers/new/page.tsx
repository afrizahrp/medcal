"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceManufacturerFormFields,
  buildDeviceManufacturerCreatePayload,
  formatDeviceManufacturerApiError,
  type DeviceManufacturerFormValue,
} from "../device-manufacturer-form-fields";
import {
  PageHeader,
  Surface,
  deviceManufacturerFormActionsClass,
  deviceManufacturerFormPageClass,
  deviceManufacturerFormSurfaceClass,
} from "../device-manufacturers-ui";
import { useCreateDeviceManufacturer } from "../use-device-manufacturers-query";

const emptyForm: DeviceManufacturerFormValue = {
  code: "",
  name: "",
  description: "",
};

export default function NewDeviceManufacturerPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDeviceManufacturer();

  const [form, setForm] = useState<DeviceManufacturerFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.deviceManufacturerCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DeviceManufacturerFormValue>(
    field: K,
    next: DeviceManufacturerFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Nama Device Manufacturer wajib diisi.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildDeviceManufacturerCreatePayload(form));
      setSuccess(`Device Manufacturer ${row.code} berhasil dibuat.`);
      router.push(`/device-manufacturers/${row.id}`);
    } catch (err) {
      setError(formatDeviceManufacturerApiError(err));
    }
  }

  return (
    <div className={deviceManufacturerFormPageClass}>
      <PageHeader
        title="New Device Manufacturer"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-manufacturers", label: "Device Manufacturer" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={deviceManufacturerFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DeviceManufacturerFormFields value={form} onChange={setField} />

          <div className={deviceManufacturerFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/device-manufacturers">Cancel</Link>
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
