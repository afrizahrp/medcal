"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceCapabilityFormFields,
  buildDeviceCapabilityCreatePayload,
  formatDeviceCapabilityApiError,
  type DeviceCapabilityFormValue,
} from "../device-capability-form-fields";
import {
  PageHeader,
  Surface,
  deviceCapabilityFormActionsClass,
  deviceCapabilityFormPageClass,
  deviceCapabilityFormSurfaceClass,
} from "../device-capabilities-ui";
import { useCreateDeviceCapability } from "../use-device-capabilities-query";

const emptyForm: DeviceCapabilityFormValue = {
  code: "",
  name: "",
  description: "",
};

export default function NewDeviceCapabilityPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDeviceCapability();

  const [form, setForm] = useState<DeviceCapabilityFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.deviceCapabilityCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DeviceCapabilityFormValue>(
    field: K,
    next: DeviceCapabilityFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.code.trim()) {
      setError("Kode capability wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama capability wajib diisi.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildDeviceCapabilityCreatePayload(form));
      setSuccess(`Device Capability ${row.code} berhasil dibuat.`);
      router.push(`/device-capabilities/${row.id}`);
    } catch (err) {
      setError(formatDeviceCapabilityApiError(err));
    }
  }

  return (
    <div className={deviceCapabilityFormPageClass}>
      <PageHeader
        title="New Device Capability"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-capabilities", label: "Device Capability" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={deviceCapabilityFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DeviceCapabilityFormFields value={form} onChange={setField} />

          <div className={deviceCapabilityFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/device-capabilities">Cancel</Link>
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
