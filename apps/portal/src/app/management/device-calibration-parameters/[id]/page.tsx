"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceCalibrationParameterFormFields,
  buildDeviceCalibrationParameterUpdatePayload,
  formatDeviceCalibrationParameterApiError,
  type DeviceCalibrationParameterFormValue,
} from "../device-calibration-parameter-form-fields";
import {
  type DeviceCalibrationParameterRow,
  PageHeader,
  Surface,
  deviceCalibrationParameterFormActionsClass,
  deviceCalibrationParameterFormPageClass,
  deviceCalibrationParameterFormSurfaceClass,
} from "../device-calibration-parameters-ui";
import {
  useDeleteDeviceCalibrationParameter,
  useDeviceCalibrationParameter,
  useUpdateDeviceCalibrationParameter,
} from "../use-device-calibration-parameters-query";
import {
  useDeviceCapabilities,
  useDeviceCapabilityItems,
} from "../../device-capabilities/use-device-capabilities-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";
import { useUoms } from "../../uoms/use-uoms-query";

const emptyForm: DeviceCalibrationParameterFormValue = {
  deviceTypeId: "",
  capabilityId: "",
  capabilityItemId: "",
  code: "",
  name: "",
  uomId: "",
  description: "",
};

function formFromRow(row: DeviceCalibrationParameterRow): DeviceCalibrationParameterFormValue {
  return {
    deviceTypeId: row.deviceTypeId,
    capabilityId: row.capabilityItem.capabilityId,
    capabilityItemId: row.capabilityItemId,
    code: row.code,
    name: row.name,
    uomId: row.uomId,
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

export default function DeviceCalibrationParameterDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();
  const parameterQuery = useDeviceCalibrationParameter(params.id);
  const updateMutation = useUpdateDeviceCalibrationParameter();
  const deleteMutation = useDeleteDeviceCalibrationParameter();

  const row = parameterQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceCalibrationParameterFormValue>(emptyForm);
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
  const capabilitiesQuery = useDeviceCapabilities({
    search: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const itemsQuery = useDeviceCapabilityItems(form.capabilityId || undefined);
  const uomsQuery = useUoms({
    search: "",
    category: "",
    isActive: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
  }, [row]);

  if (!capabilities?.deviceCalibrationParameterRead) {
    return <AccessDenied />;
  }

  if (parameterQuery.isLoading) {
    return (
      <div className={deviceCalibrationParameterFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(parameterQuery.error)) {
    return <AccessDenied />;
  }

  if (parameterQuery.error instanceof ApiError && parameterQuery.error.status === 404) {
    return (
      <div className={deviceCalibrationParameterFormPageClass}>
        <PageHeader
          title="Calibration Parameter tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/device-calibration-parameters", label: "Calibration Parameter" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Calibration Parameter tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={deviceCalibrationParameterFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Calibration Parameter.</p>
      </div>
    );
  }

  function setField<K extends keyof DeviceCalibrationParameterFormValue>(
    field: K,
    next: DeviceCalibrationParameterFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromRow(row!));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCalibrationParameterUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.deviceTypeId) {
      setError("Device Type wajib dipilih.");
      return;
    }
    if (!form.capabilityItemId) {
      setError("Capability Item wajib dipilih.");
      return;
    }
    if (!form.code.trim()) {
      setError("Kode wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    if (!form.uomId) {
      setError("UOM wajib dipilih.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceCalibrationParameterUpdatePayload(form),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await parameterQuery.refetch();
    } catch (err) {
      setError(formatDeviceCalibrationParameterApiError(err));
    }
  }

  async function remove() {
    if (!capabilities?.deviceCalibrationParameterDelete) return;
    if (!confirm(`Yakin ingin menghapus Calibration Parameter "${row!.name}"?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteMutation.mutateAsync(row!.id);
      router.push("/device-calibration-parameters");
    } catch (err) {
      setError(formatDeviceCalibrationParameterApiError(err));
    }
  }

  return (
    <div className={deviceCalibrationParameterFormPageClass}>
      <PageHeader
        title={row.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-calibration-parameters", label: "Calibration Parameter" },
          { label: row.name },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={deviceCalibrationParameterFormSurfaceClass}>
        {editing ? (
          <form onSubmit={save}>
            <DeviceCalibrationParameterFormFields
              value={form}
              onChange={setField}
              deviceTypes={typesQuery.data?.data ?? []}
              deviceTypesLoading={typesQuery.isLoading}
              capabilities={capabilitiesQuery.data?.data ?? []}
              capabilitiesLoading={capabilitiesQuery.isLoading}
              capabilityItems={itemsQuery.data ?? []}
              capabilityItemsLoading={itemsQuery.isLoading}
              uoms={uomsQuery.data?.data ?? []}
              uomsLoading={uomsQuery.isLoading}
            />

            <div className={deviceCalibrationParameterFormActionsClass}>
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
              <DetailField label="Device Type">
                <span className="font-medium">{row.deviceType.name}</span>
              </DetailField>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Capability">
                  <span className="font-medium">{row.capabilityItem.capability.name}</span>
                </DetailField>
                <DetailField label="Capability Item">
                  <span className="font-medium">{row.capabilityItem.name}</span>
                </DetailField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Kode">
                  <span className="font-mono font-medium text-slate-900">{row.code}</span>
                </DetailField>
                <DetailField label="Nama">
                  <span className="font-medium text-slate-900">{row.name}</span>
                </DetailField>
              </div>

              <DetailField label="UOM">
                <span className="font-medium">
                  {row.uom.symbol} — {row.uom.name}
                </span>
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
              {capabilities.deviceCalibrationParameterDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={remove}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Menghapus…" : "Hapus"}
                </Button>
              ) : null}
              {capabilities.deviceCalibrationParameterUpdate ? (
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
