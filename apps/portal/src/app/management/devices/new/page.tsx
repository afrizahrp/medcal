"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceFormFields,
  buildDeviceCreatePayload,
  formatDeviceApiError,
  type DeviceFormValue,
} from "../device-form-fields";
import {
  PageHeader,
  Surface,
  deviceFormActionsClass,
  deviceFormPageClass,
  deviceFormSurfaceClass,
} from "../devices-ui";
import { useCreateDevice } from "../use-devices-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";
import { useCustomers } from "../../customers/use-customers-query";

const emptyForm: DeviceFormValue = {
  deviceTypeId: "",
  customerId: "",
  brand: "",
  model: "",
  serialNumber: "",
  category: "",
  status: "ACTIVE",
};

export default function NewDevicePage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDevice();
  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const customersQuery = useCustomers({
    search: "",
    status: "ACTIVE",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const [form, setForm] = useState<DeviceFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.deviceCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DeviceFormValue>(field: K, next: DeviceFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.deviceTypeId) {
      setError("Device Type wajib dipilih.");
      return;
    }
    if (!form.customerId) {
      setError("Customer wajib dipilih.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildDeviceCreatePayload(form));
      const label = [row.brand, row.model, row.serialNumber].filter(Boolean).join(" ") || row.id;
      setSuccess(`Device ${label} berhasil dibuat.`);
      router.push(`/devices/${row.id}`);
    } catch (err) {
      setError(formatDeviceApiError(err));
    }
  }

  return (
    <div className={deviceFormPageClass}>
      <PageHeader
        title="New Device"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/devices", label: "Device" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={deviceFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DeviceFormFields
            value={form}
            onChange={setField}
            deviceTypes={typesQuery.data?.data ?? []}
            deviceTypesLoading={typesQuery.isLoading}
            customers={customersQuery.data?.data ?? []}
            customersLoading={customersQuery.isLoading}
          />

          <div className={deviceFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/devices">Cancel</Link>
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
