"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  EquipmentTypeFormFields,
  buildEquipmentTypeUpdatePayload,
  formatEquipmentTypeApiError,
  type EquipmentTypeFormValue,
} from "../equipment-type-form-fields";
import {
  type EquipmentTypeRow,
  EquipmentTypeStatusBadge,
  PageHeader,
  Surface,
  equipmentTypeFormActionsClass,
  equipmentTypeFormPageClass,
  equipmentTypeFormSurfaceClass,
  selectClassName,
} from "../equipment-types-ui";
import {
  useDeleteEquipmentType,
  useEquipmentType,
  useUpdateEquipmentType,
} from "../use-equipment-types-query";

const emptyForm: EquipmentTypeFormValue = {
  code: "",
  name: "",
  description: "",
  category: "",
};

function formFromRow(row: EquipmentTypeRow): EquipmentTypeFormValue {
  return {
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    category: row.category ?? "",
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

export default function EquipmentTypeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();
  const typeQuery = useEquipmentType(params.id);
  const updateMutation = useUpdateEquipmentType();
  const deleteMutation = useDeleteEquipmentType();

  const row = typeQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EquipmentTypeFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
    setIsActive(row.isActive);
  }, [row]);

  if (!capabilities?.equipmentTypeRead) {
    return <AccessDenied />;
  }

  if (typeQuery.isLoading) {
    return (
      <div className={equipmentTypeFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(typeQuery.error)) {
    return <AccessDenied />;
  }

  if (typeQuery.error instanceof ApiError && typeQuery.error.status === 404) {
    return (
      <div className={equipmentTypeFormPageClass}>
        <PageHeader
          title="Equipment Type tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/equipment-types", label: "Equipment Type" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Equipment Type tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={equipmentTypeFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Equipment Type.</p>
      </div>
    );
  }

  function setField<K extends keyof EquipmentTypeFormValue>(
    field: K,
    next: EquipmentTypeFormValue[K],
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
    if (!capabilities?.equipmentTypeUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.code.trim()) {
      setError("Kode Equipment Type wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama Equipment Type wajib diisi.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildEquipmentTypeUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await typeQuery.refetch();
    } catch (err) {
      setError(formatEquipmentTypeApiError(err));
    }
  }

  async function remove() {
    if (!capabilities?.equipmentTypeDelete) return;
    if (!confirm(`Yakin ingin menghapus Equipment Type "${row!.name}"?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteMutation.mutateAsync(row!.id);
      router.push("/equipment-types");
    } catch (err) {
      setError(formatEquipmentTypeApiError(err));
    }
  }

  return (
    <div className={equipmentTypeFormPageClass}>
      <PageHeader
        title={row.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/equipment-types", label: "Equipment Type" },
          { label: row.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={equipmentTypeFormSurfaceClass}>
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
            <EquipmentTypeStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <EquipmentTypeFormFields value={form} onChange={setField} />

            <div className={equipmentTypeFormActionsClass}>
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

              <DetailField label="Kategori">
                {row.category ? <span>{row.category}</span> : <span className="text-slate-400">—</span>}
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
              {capabilities.equipmentTypeDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={remove}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Menghapus…" : "Hapus"}
                </Button>
              ) : null}
              {capabilities.equipmentTypeUpdate ? (
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
