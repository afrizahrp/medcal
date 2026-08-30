"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceTypeFormFields,
  buildDeviceTypeCreatePayload,
  formatDeviceTypeApiError,
  type DeviceTypeFormValue,
} from "../device-type-form-fields";
import {
  PageHeader,
  Surface,
  deviceTypeFormActionsClass,
  deviceTypeFormPageClass,
  deviceTypeFormSurfaceClass,
} from "../device-types-ui";
import { useCreateDeviceType } from "../use-device-types-query";
import { useDeviceCategories } from "../../device-categories/use-device-categories-query";

const emptyForm: DeviceTypeFormValue = {
  code: "",
  name: "",
  categoryId: "",
  description: "",
};

export default function NewDeviceTypePage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDeviceType();
  const categoriesQuery = useDeviceCategories({
    search: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const [form, setForm] = useState<DeviceTypeFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.deviceTypeCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DeviceTypeFormValue>(field: K, next: DeviceTypeFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.code.trim()) {
      setError("Kode Device Name wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama Device Name wajib diisi.");
      return;
    }
    if (!form.categoryId) {
      setError("Kategori wajib dipilih.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildDeviceTypeCreatePayload(form));
      setSuccess(`Device Name ${row.code} berhasil dibuat.`);
      router.push(`/device-types/${row.id}`);
    } catch (err) {
      setError(formatDeviceTypeApiError(err));
    }
  }

  return (
    <div className={deviceTypeFormPageClass}>
      <PageHeader
        title="New Device Name"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-types", label: "Device Name" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={deviceTypeFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DeviceTypeFormFields
            value={form}
            onChange={setField}
            categories={categoriesQuery.data?.data ?? []}
            categoriesLoading={categoriesQuery.isLoading}
          />

          <div className={deviceTypeFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/device-types">Cancel</Link>
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
