"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceManufacturerFormFields,
  buildDeviceManufacturerUpdatePayload,
  formatDeviceManufacturerApiError,
  type DeviceManufacturerFormValue,
} from "../device-manufacturer-form-fields";
import {
  type DeviceManufacturerRow,
  DeviceManufacturerStatusBadge,
  PageHeader,
  Surface,
  deviceManufacturerFormActionsClass,
  deviceManufacturerFormPageClass,
  deviceManufacturerFormSurfaceClass,
  selectClassName,
} from "../device-manufacturers-ui";
import {
  useDeviceManufacturer,
  useUpdateDeviceManufacturer,
} from "../use-device-manufacturers-query";

const emptyForm: DeviceManufacturerFormValue = {
  code: "",
  name: "",
  description: "",
};

function formFromRow(row: DeviceManufacturerRow): DeviceManufacturerFormValue {
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

export default function DeviceManufacturerDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const manufacturerQuery = useDeviceManufacturer(params.id);
  const updateMutation = useUpdateDeviceManufacturer();

  const row = manufacturerQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceManufacturerFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
    setIsActive(row.isActive);
  }, [row]);

  if (!capabilities?.deviceManufacturerRead) {
    return <AccessDenied />;
  }

  if (manufacturerQuery.isLoading) {
    return (
      <div className={deviceManufacturerFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(manufacturerQuery.error)) {
    return <AccessDenied />;
  }

  if (manufacturerQuery.error instanceof ApiError && manufacturerQuery.error.status === 404) {
    return (
      <div className={deviceManufacturerFormPageClass}>
        <PageHeader
          title="Device Manufacturer tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/device-manufacturers", label: "Device Manufacturer" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Device Manufacturer tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={deviceManufacturerFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Device Manufacturer.</p>
      </div>
    );
  }

  function setField<K extends keyof DeviceManufacturerFormValue>(
    field: K,
    next: DeviceManufacturerFormValue[K],
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
    if (!capabilities?.deviceManufacturerUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Nama Device Manufacturer wajib diisi.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceManufacturerUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await manufacturerQuery.refetch();
    } catch (err) {
      setError(formatDeviceManufacturerApiError(err));
    }
  }

  return (
    <div className={deviceManufacturerFormPageClass}>
      <PageHeader
        title={row.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-manufacturers", label: "Device Manufacturer" },
          { label: row.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={deviceManufacturerFormSurfaceClass}>
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
            <DeviceManufacturerStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <DeviceManufacturerFormFields value={form} onChange={setField} mode="edit" />

            <div className={deviceManufacturerFormActionsClass}>
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
              {capabilities.deviceManufacturerUpdate ? (
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
