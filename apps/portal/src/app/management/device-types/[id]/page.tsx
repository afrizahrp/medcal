"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceTypeFormFields,
  buildDeviceTypeUpdatePayload,
  formatDeviceTypeApiError,
  type DeviceTypeFormValue,
} from "../device-type-form-fields";
import {
  type DeviceTypeRow,
  DeviceTypeStatusBadge,
  PageHeader,
  Surface,
  deviceTypeFormActionsClass,
  deviceTypeFormPageClass,
  deviceTypeFormSurfaceClass,
  selectClassName,
} from "../device-types-ui";
import { useDeviceType, useUpdateDeviceType } from "../use-device-types-query";
import { useDeviceCategories } from "../../device-categories/use-device-categories-query";

const emptyForm: DeviceTypeFormValue = {
  code: "",
  name: "",
  categoryId: "",
  description: "",
};

function formFromRow(row: DeviceTypeRow): DeviceTypeFormValue {
  return {
    code: row.code,
    name: row.name,
    categoryId: row.categoryId,
    description: row.description ?? "",
  };
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}

export default function DeviceTypeDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const typeQuery = useDeviceType(params.id);
  const updateMutation = useUpdateDeviceType();
  const categoriesQuery = useDeviceCategories({
    search: "",
    isActive: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const row = typeQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceTypeFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
    setIsActive(row.isActive);
  }, [row]);

  if (!capabilities?.deviceTypeRead) {
    return <AccessDenied />;
  }

  if (typeQuery.isLoading) {
    return (
      <div className={deviceTypeFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(typeQuery.error)) {
    return <AccessDenied />;
  }

  if (typeQuery.error instanceof ApiError && typeQuery.error.status === 404) {
    return (
      <div className={deviceTypeFormPageClass}>
        <PageHeader
          title="Device Name tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/device-types", label: "Device Name" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Device Name tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={deviceTypeFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Device Name.</p>
      </div>
    );
  }

  function setField<K extends keyof DeviceTypeFormValue>(field: K, next: DeviceTypeFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromRow(row!));
    setIsActive(row!.isActive);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceTypeUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Nama Device Name wajib diisi.");
      return;
    }
    if (!form.categoryId) {
      setError("Kategori wajib dipilih.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceTypeUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await typeQuery.refetch();
    } catch (err) {
      setError(formatDeviceTypeApiError(err));
    }
  }

  return (
    <div className={deviceTypeFormPageClass}>
      <PageHeader
        title={row.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-types", label: "Device Name" },
          { label: row.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={deviceTypeFormSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{row.code}</p>
          {editing ? (
            <select
              value={isActive ? "true" : "false"}
              onChange={(e) => setIsActive(e.target.value === "true")}
              className={`${selectClassName} min-w-[140px]`}
              aria-label="Status"
            >
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          ) : (
            <DeviceTypeStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <DeviceTypeFormFields
              value={form}
              onChange={setField}
              categories={categoriesQuery.data?.data ?? []}
              categoriesLoading={categoriesQuery.isLoading}
              mode="edit"
            />

            <div className={deviceTypeFormActionsClass}>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="mt-3 space-y-3 text-sm">
              <DetailField label="Kode">
                <span className="font-mono font-medium text-slate-900">{row.code}</span>
              </DetailField>

              <DetailField label="Nama">
                <span className="font-medium text-slate-900">{row.name}</span>
              </DetailField>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Kategori">
                  <span className="font-medium">{row.category.name}</span>
                </DetailField>
                <DetailField label="Kode kategori">
                  <span className="font-mono text-xs">{row.category.code}</span>
                </DetailField>
              </div>

              <DetailField label="Deskripsi">
                {row.description ? (
                  <span>{row.description}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </DetailField>
            </dl>

            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              {capabilities.deviceTypeUpdate ? (
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Surface>
    </div>
  );
}
