"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceCategoryFormFields,
  buildDeviceCategoryCreatePayload,
  formatDeviceCategoryApiError,
  type DeviceCategoryFormValue,
} from "../device-category-form-fields";
import {
  PageHeader,
  Surface,
  deviceCategoryFormActionsClass,
  deviceCategoryFormPageClass,
  deviceCategoryFormSurfaceClass,
} from "../device-categories-ui";
import { useCreateDeviceCategory } from "../use-device-categories-query";

const emptyForm: DeviceCategoryFormValue = {
  code: "",
  name: "",
  description: "",
};

export default function NewDeviceCategoryPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDeviceCategory();

  const [form, setForm] = useState<DeviceCategoryFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!capabilities?.deviceCategoryCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DeviceCategoryFormValue>(
    field: K,
    next: DeviceCategoryFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Nama kategori wajib diisi.");
      return;
    }

    try {
      const row = await createMutation.mutateAsync(buildDeviceCategoryCreatePayload(form));
      setSuccess(`Device Category ${row.code} berhasil dibuat.`);
      router.push(`/device-categories/${row.id}`);
    } catch (err) {
      setError(formatDeviceCategoryApiError(err));
    }
  }

  return (
    <div className={deviceCategoryFormPageClass}>
      <PageHeader
        title="New Device Category"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-categories", label: "Device Category" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={deviceCategoryFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DeviceCategoryFormFields value={form} onChange={setField} />

          <div className={deviceCategoryFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/device-categories">Cancel</Link>
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
