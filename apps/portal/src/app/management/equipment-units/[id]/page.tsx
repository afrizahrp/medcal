"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  EquipmentUnitFormFields,
  buildEquipmentUnitUpdatePayload,
  formatEquipmentUnitApiError,
  type EquipmentUnitFormValue,
} from "../equipment-unit-form-fields";
import {
  type EquipmentUnitRow,
  EquipmentUnitStatusBadge,
  PageHeader,
  Surface,
  equipmentUnitFormActionsClass,
  equipmentUnitFormPageClass,
  equipmentUnitFormSurfaceClass,
  selectClassName,
} from "../equipment-units-ui";
import {
  useDeleteEquipmentUnit,
  useEquipmentTypeOptions,
  useEquipmentUnit,
  useUpdateEquipmentUnit,
} from "../use-equipment-units-query";
import { EquipmentCalibrationRecordsPanel } from "../equipment-calibration-records-panel";

const emptyForm: EquipmentUnitFormValue = {
  equipmentTypeId: "",
  code: "",
  brand: "",
  model: "",
  serialNumber: "",
  notes: "",
};

function formFromRow(row: EquipmentUnitRow): EquipmentUnitFormValue {
  return {
    equipmentTypeId: row.equipmentTypeId,
    code: row.code,
    brand: row.brand ?? "",
    model: row.model ?? "",
    serialNumber: row.serialNumber ?? "",
    notes: row.notes ?? "",
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

export default function EquipmentUnitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();
  const unitQuery = useEquipmentUnit(params.id);
  const updateMutation = useUpdateEquipmentUnit();
  const deleteMutation = useDeleteEquipmentUnit();
  const optionsQuery = useEquipmentTypeOptions(Boolean(capabilities?.equipmentRead));

  const row = unitQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EquipmentUnitFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const equipmentTypeOptions = useMemo(
    () =>
      (optionsQuery.data?.data ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name })),
    [optionsQuery.data],
  );

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
    setIsActive(row.isActive);
  }, [row]);

  if (!capabilities?.equipmentRead) {
    return <AccessDenied />;
  }

  if (unitQuery.isLoading) {
    return (
      <div className={equipmentUnitFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(unitQuery.error)) {
    return <AccessDenied />;
  }

  if (unitQuery.error instanceof ApiError && unitQuery.error.status === 404) {
    return (
      <div className={equipmentUnitFormPageClass}>
        <PageHeader
          title="Equipment Unit tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/equipment-units", label: "Equipment Unit" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Equipment Unit tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={equipmentUnitFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Equipment Unit.</p>
      </div>
    );
  }

  function setField<K extends keyof EquipmentUnitFormValue>(
    field: K,
    next: EquipmentUnitFormValue[K],
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
    if (!capabilities?.equipmentUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.equipmentTypeId) {
      setError("Equipment Type wajib dipilih.");
      return;
    }
    if (!form.code.trim()) {
      setError("Kode Equipment Unit wajib diisi.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildEquipmentUnitUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await unitQuery.refetch();
    } catch (err) {
      setError(formatEquipmentUnitApiError(err));
    }
  }

  async function remove() {
    if (!capabilities?.equipmentDelete) return;
    if (!confirm(`Yakin ingin menghapus Equipment Unit "${row!.code}"?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteMutation.mutateAsync(row!.id);
      router.push("/equipment-units");
    } catch (err) {
      setError(formatEquipmentUnitApiError(err));
    }
  }

  return (
    <div className={equipmentUnitFormPageClass}>
      <PageHeader
        title={row.code}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/equipment-units", label: "Equipment Unit" },
          { label: row.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={equipmentUnitFormSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">{row.equipmentType.name}</p>
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
            <EquipmentUnitStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <EquipmentUnitFormFields
              value={form}
              onChange={setField}
              equipmentTypeOptions={equipmentTypeOptions}
            />

            <div className={equipmentUnitFormActionsClass}>
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
              <DetailField label="Equipment Type">
                <span className="font-medium text-slate-900">{row.equipmentType.name}</span>{" "}
                <span className="font-mono text-xs text-slate-400">{row.equipmentType.code}</span>
              </DetailField>
              <DetailField label="Merek">
                {row.brand ? <span>{row.brand}</span> : <span className="text-slate-400">—</span>}
              </DetailField>
              <DetailField label="Model">
                {row.model ? <span>{row.model}</span> : <span className="text-slate-400">—</span>}
              </DetailField>
              <DetailField label="No. Seri">
                {row.serialNumber ? (
                  <span className="font-mono">{row.serialNumber}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </DetailField>
              <DetailField label="Catatan">
                {row.notes ? <span>{row.notes}</span> : <span className="text-slate-400">—</span>}
              </DetailField>
            </dl>

            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              {capabilities.equipmentDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={remove}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Menghapus…" : "Hapus"}
                </Button>
              ) : null}
              {capabilities.equipmentUpdate ? (
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Surface>

      {!editing ? (
        <EquipmentCalibrationRecordsPanel
          equipmentId={row.id}
          canRead={Boolean(capabilities.equipmentCalibrationRecordRead)}
          canManage={Boolean(
            capabilities.equipmentCalibrationRecordCreate &&
              capabilities.equipmentCalibrationRecordUpdate &&
              capabilities.equipmentCalibrationRecordDelete,
          )}
        />
      ) : null}
    </div>
  );
}
