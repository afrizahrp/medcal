"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DevicePhysicalCheckItemFormFields,
  buildDevicePhysicalCheckItemUpdatePayload,
  formatDevicePhysicalCheckItemApiError,
  validateDevicePhysicalCheckItemForm,
  type DevicePhysicalCheckItemFormValue,
} from "../device-physical-check-item-form-fields";
import {
  type DevicePhysicalCheckItemRow,
  DevicePhysicalCheckItemStatusBadge,
  PageHeader,
  Surface,
  devicePhysicalCheckItemFormActionsClass,
  devicePhysicalCheckItemFormPageClass,
  devicePhysicalCheckItemFormSurfaceClass,
  selectClassName,
} from "../device-physical-check-items-ui";
import {
  useDevicePhysicalCheckItem,
  useUpdateDevicePhysicalCheckItem,
} from "../use-device-physical-check-items-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";

const emptyForm: DevicePhysicalCheckItemFormValue = {
  deviceTypeId: "",
  code: "",
  name: "",
  inspectionLimit: "",
};

function formFromRow(row: DevicePhysicalCheckItemRow): DevicePhysicalCheckItemFormValue {
  return {
    deviceTypeId: row.deviceTypeId,
    code: row.code,
    name: row.name,
    inspectionLimit: row.inspectionLimit ?? "",
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

export default function DevicePhysicalCheckItemDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const itemQuery = useDevicePhysicalCheckItem(params.id);
  const updateMutation = useUpdateDevicePhysicalCheckItem();

  const row = itemQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DevicePhysicalCheckItemFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
    setIsActive(row.isActive);
  }, [row]);

  if (!capabilities?.devicePhysicalCheckItemRead) {
    return <AccessDenied />;
  }

  if (itemQuery.isLoading) {
    return (
      <div className={devicePhysicalCheckItemFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(itemQuery.error)) {
    return <AccessDenied />;
  }

  if (itemQuery.error instanceof ApiError && itemQuery.error.status === 404) {
    return (
      <div className={devicePhysicalCheckItemFormPageClass}>
        <PageHeader
          title="Physical Inspection tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/device-physical-check-items", label: "Physical Inspection" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Physical Inspection item tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={devicePhysicalCheckItemFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Physical Inspection.</p>
      </div>
    );
  }

  function setField<K extends keyof DevicePhysicalCheckItemFormValue>(
    field: K,
    next: DevicePhysicalCheckItemFormValue[K],
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
    if (!capabilities?.devicePhysicalCheckItemUpdate) return;
    setError(null);
    setSuccess(null);

    const validationError = validateDevicePhysicalCheckItemForm(form, "edit");
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDevicePhysicalCheckItemUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await itemQuery.refetch();
    } catch (err) {
      setError(formatDevicePhysicalCheckItemApiError(err));
    }
  }

  return (
    <div className={devicePhysicalCheckItemFormPageClass}>
      <PageHeader
        title={row.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-physical-check-items", label: "Physical Inspection" },
          { label: row.name },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={devicePhysicalCheckItemFormSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">{row.deviceType.name}</p>
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
            <DevicePhysicalCheckItemStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <DevicePhysicalCheckItemFormFields
              value={form}
              onChange={setField}
              mode="edit"
              deviceTypes={typesQuery.data?.data ?? []}
              deviceTypesLoading={typesQuery.isLoading}
            />

            <div className={devicePhysicalCheckItemFormActionsClass}>
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
              <DetailField label="Device Name">
                <span className="font-medium">{row.deviceType.name}</span>
              </DetailField>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Kode">
                  <span className="font-mono font-medium text-slate-900">{row.code}</span>
                </DetailField>
                <DetailField label="Item / Parameter">
                  <span className="font-medium text-slate-900">{row.name}</span>
                </DetailField>
              </div>

              <DetailField label="Batas Pemeriksaan">
                <span className="font-medium">{row.inspectionLimit || "—"}</span>
              </DetailField>
            </dl>

            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              {capabilities.devicePhysicalCheckItemUpdate ? (
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
