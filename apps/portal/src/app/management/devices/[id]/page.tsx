"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceFormFields,
  buildDeviceUpdatePayload,
  formatDeviceApiError,
  type DeviceFormValue,
} from "../device-form-fields";
import {
  type DeviceRow,
  DeviceStatusBadge,
  PageHeader,
  Surface,
  deviceFormActionsClass,
  deviceFormPageClass,
  deviceFormSurfaceClass,
} from "../devices-ui";
import { useDevice, useUpdateDevice } from "../use-devices-query";
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

function formFromRow(row: DeviceRow): DeviceFormValue {
  return {
    deviceTypeId: row.deviceTypeId,
    customerId: row.customerId,
    brand: row.brand ?? "",
    model: row.model ?? "",
    serialNumber: row.serialNumber ?? "",
    category: row.category ?? "",
    status: row.status,
  };
}

function deviceTitle(row: DeviceRow): string {
  return [row.brand, row.model].filter(Boolean).join(" ") || row.serialNumber || "Device";
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const deviceQuery = useDevice(params.id);
  const updateMutation = useUpdateDevice();
  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const customersQuery = useCustomers({
    search: "",
    status: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const row = deviceQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
  }, [row]);

  if (!capabilities?.deviceRead) {
    return <AccessDenied />;
  }

  if (deviceQuery.isLoading) {
    return (
      <div className={deviceFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(deviceQuery.error)) {
    return <AccessDenied />;
  }

  if (deviceQuery.error instanceof ApiError && deviceQuery.error.status === 404) {
    return (
      <div className={deviceFormPageClass}>
        <PageHeader
          title="Device tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/devices", label: "Device" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Device tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={deviceFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Device.</p>
      </div>
    );
  }

  function setField<K extends keyof DeviceFormValue>(field: K, next: DeviceFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromRow(row!));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceUpdate) return;
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
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceUpdatePayload(form),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await deviceQuery.refetch();
    } catch (err) {
      setError(formatDeviceApiError(err));
    }
  }

  return (
    <div className={deviceFormPageClass}>
      <PageHeader
        title={deviceTitle(row)}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/devices", label: "Device" },
          { label: row.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={deviceFormSurfaceClass}>
        <div className="mb-3 border-b border-slate-100 pb-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Kode</p>
          <p className="mt-0.5 font-mono text-sm font-medium text-slate-900">{row.code}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Kode otomatis dari sistem — tidak dapat diubah.
          </p>
        </div>
        {editing ? (
          <form onSubmit={save}>
            <DeviceFormFields
              value={form}
              onChange={setField}
              deviceTypes={typesQuery.data?.data ?? []}
              deviceTypesLoading={typesQuery.isLoading}
              customers={customersQuery.data?.data ?? []}
              customersLoading={customersQuery.isLoading}
            />

            <div className={deviceFormActionsClass}>
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
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <DetailField label="Device Type">
                  <span className="font-medium">{row.deviceType.name}</span>
                </DetailField>
                <DeviceStatusBadge status={row.status} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Brand">
                  <span className="font-medium text-slate-900">{row.brand || "—"}</span>
                </DetailField>
                <DetailField label="Model">
                  <span className="font-medium text-slate-900">{row.model || "—"}</span>
                </DetailField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Serial Number">
                  <span className="font-mono">{row.serialNumber || "—"}</span>
                </DetailField>
                <DetailField label="Category">
                  <span>{row.category || "—"}</span>
                </DetailField>
              </div>

              <DetailField label="Customer">
                <span className="font-medium">
                  {row.customer.name}{" "}
                  <span className="font-normal text-slate-500">({row.customer.number})</span>
                </span>
              </DetailField>
            </dl>

            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              {capabilities.deviceUpdate ? (
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
