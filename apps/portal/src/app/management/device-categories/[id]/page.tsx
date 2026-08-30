"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceCategoryFormFields,
  buildDeviceCategoryUpdatePayload,
  formatDeviceCategoryApiError,
  type DeviceCategoryFormValue,
} from "../device-category-form-fields";
import {
  type DeviceCategoryRow,
  DeviceCategoryStatusBadge,
  PageHeader,
  Surface,
  deviceCategoryFormActionsClass,
  deviceCategoryFormPageClass,
  deviceCategoryFormSurfaceClass,
  selectClassName,
} from "../device-categories-ui";
import {
  useDeleteDeviceCategory,
  useDeviceCategory,
  useUpdateDeviceCategory,
} from "../use-device-categories-query";

const emptyForm: DeviceCategoryFormValue = {
  code: "",
  name: "",
  description: "",
};

function formFromRow(row: DeviceCategoryRow): DeviceCategoryFormValue {
  return {
    code: row.code,
    name: row.name,
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

export default function DeviceCategoryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();
  const categoryQuery = useDeviceCategory(params.id);
  const updateMutation = useUpdateDeviceCategory();
  const deleteMutation = useDeleteDeviceCategory();

  const row = categoryQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceCategoryFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
    setIsActive(row.isActive);
  }, [row]);

  if (!capabilities?.deviceCategoryRead) {
    return <AccessDenied />;
  }

  if (categoryQuery.isLoading) {
    return (
      <div className={deviceCategoryFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(categoryQuery.error)) {
    return <AccessDenied />;
  }

  if (categoryQuery.error instanceof ApiError && categoryQuery.error.status === 404) {
    return (
      <div className={deviceCategoryFormPageClass}>
        <PageHeader
          title="Device Category tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/device-categories", label: "Device Category" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Device Category tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={deviceCategoryFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Device Category.</p>
      </div>
    );
  }

  function setField<K extends keyof DeviceCategoryFormValue>(
    field: K,
    next: DeviceCategoryFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromRow(row!));
    setIsActive(row!.isActive);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCategoryUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.code.trim()) {
      setError("Kode kategori wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama kategori wajib diisi.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceCategoryUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await categoryQuery.refetch();
    } catch (err) {
      setError(formatDeviceCategoryApiError(err));
    }
  }

  async function remove() {
    if (!capabilities?.deviceCategoryDelete) return;
    if (!confirm(`Yakin ingin menghapus kategori "${row!.name}"?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteMutation.mutateAsync(row!.id);
      router.push("/device-categories");
    } catch (err) {
      setError(formatDeviceCategoryApiError(err));
    }
  }

  return (
    <div className={deviceCategoryFormPageClass}>
      <PageHeader
        title={row.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-categories", label: "Device Category" },
          { label: row.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={deviceCategoryFormSurfaceClass}>
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
            <DeviceCategoryStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <DeviceCategoryFormFields value={form} onChange={setField} mode="edit" />

            <div className={deviceCategoryFormActionsClass}>
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

              <DetailField label="Deskripsi">
                {row.description ? (
                  <span>{row.description}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </DetailField>
            </dl>

            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              {capabilities.deviceCategoryDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={remove}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Menghapus…" : "Hapus"}
                </Button>
              ) : null}
              {capabilities.deviceCategoryUpdate ? (
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
