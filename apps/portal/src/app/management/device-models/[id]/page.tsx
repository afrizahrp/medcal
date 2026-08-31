"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceModelFormFields,
  buildDeviceModelUpdatePayload,
  formatDeviceModelApiError,
  type DeviceModelFormValue,
} from "../device-model-form-fields";
import {
  type DeviceModelRow,
  DeviceModelStatusBadge,
  PageHeader,
  Surface,
  deviceModelFormActionsClass,
  deviceModelFormPageClass,
  deviceModelFormSurfaceClass,
  selectClassName,
} from "../device-models-ui";
import { useDeviceModel, useUpdateDeviceModel } from "../use-device-models-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";

const emptyForm: DeviceModelFormValue = {
  deviceTypeId: "",
  manufacturer: "",
  model: "",
  description: "",
};

function formFromRow(row: DeviceModelRow): DeviceModelFormValue {
  return {
    deviceTypeId: row.deviceTypeId,
    manufacturer: row.manufacturer,
    model: row.model,
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

export default function DeviceModelDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const modelQuery = useDeviceModel(params.id);
  const updateMutation = useUpdateDeviceModel();
  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const row = modelQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceModelFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
    setIsActive(row.isActive);
  }, [row]);

  if (!capabilities?.deviceModelRead) {
    return <AccessDenied />;
  }

  if (modelQuery.isLoading) {
    return (
      <div className={deviceModelFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(modelQuery.error)) {
    return <AccessDenied />;
  }

  if (modelQuery.error instanceof ApiError && modelQuery.error.status === 404) {
    return (
      <div className={deviceModelFormPageClass}>
        <PageHeader
          title="Device Model tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/device-models", label: "Device Model" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Device Model tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={deviceModelFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Device Model.</p>
      </div>
    );
  }

  function setField<K extends keyof DeviceModelFormValue>(field: K, next: DeviceModelFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromRow(row!));
    setIsActive(row!.isActive);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceModelUpdate) return;
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
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceModelUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await modelQuery.refetch();
    } catch (err) {
      setError(formatDeviceModelApiError(err));
    }
  }

  return (
    <div className={deviceModelFormPageClass}>
      <PageHeader
        title={`${row.manufacturer} ${row.model}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-models", label: "Device Model" },
          { label: row.model },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={deviceModelFormSurfaceClass}>
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
            <DeviceModelStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <DeviceModelFormFields
              value={form}
              onChange={setField}
              deviceTypes={typesQuery.data?.data ?? []}
              deviceTypesLoading={typesQuery.isLoading}
            />

            <div className={deviceModelFormActionsClass}>
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
                <DetailField label="Manufacturer">
                  <span className="font-medium text-slate-900">{row.manufacturer}</span>
                </DetailField>
                <DetailField label="Model">
                  <span className="font-medium text-slate-900">{row.model}</span>
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
              {capabilities.deviceModelUpdate ? (
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
