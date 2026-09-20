"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceCalibrationParameterFormFields,
  buildDeviceCalibrationParameterUpdatePayload,
  formatDeviceCalibrationParameterApiError,
  validateCalibrationToleranceForm,
  type DeviceCalibrationParameterFormValue,
} from "../device-calibration-parameter-form-fields";
import {
  CalibrationTestPointFormFields,
  buildCalibrationTestPointCreatePayload,
  buildCalibrationTestPointUpdatePayload,
  calibrationTestPointFormFromRow,
  emptyCalibrationTestPointForm,
  formatCalibrationTestPointApiError,
  validateCalibrationTestPointForm,
  type CalibrationTestPointFormValue,
} from "../calibration-test-point-form-fields";
import { moveAdjacent } from "../calibration-test-point-ordering";
import {
  type DeviceCalibrationParameterRow,
  DeviceCalibrationParameterStatusBadge,
  PageHeader,
  Surface,
  deviceCalibrationParameterFormActionsClass,
  deviceCalibrationParameterFormPageClass,
  deviceCalibrationParameterFormSurfaceClass,
  formatCalibrationTolerance,
  selectClassName,
} from "../device-calibration-parameters-ui";
import {
  useDeviceCalibrationParameter,
  useUpdateDeviceCalibrationParameter,
} from "../use-device-calibration-parameters-query";
import {
  useCalibrationTestPoints,
  useCreateCalibrationTestPoint,
  useReorderCalibrationTestPoints,
  useUpdateCalibrationTestPoint,
  type CalibrationTestPointApiRow,
} from "../use-calibration-test-points-query";
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
  toleranceMin: "",
  toleranceMax: "",
  toleranceNote: "",
  decimalPlaces: "",
  logicalTestKey: "",
  logicalTestSequence: "",
  entryStyle: "DIRECT_REPLICATES",
  derivation: "",
  allowsRepeatedReadings: true,
  description: "",
};

function formFromRow(row: DeviceCalibrationParameterRow): DeviceCalibrationParameterFormValue {
  return {
    deviceTypeId: row.deviceTypeId,
    capabilityId: row.capabilityItem.capabilityId,
    capabilityItemId: row.capabilityItemId,
    code: row.code,
    name: row.name,
    uomId: row.uomId ?? "",
    toleranceMin:
      row.toleranceMin == null || row.toleranceMin === "" ? "" : String(Number(row.toleranceMin)),
    toleranceMax:
      row.toleranceMax == null || row.toleranceMax === "" ? "" : String(Number(row.toleranceMax)),
    toleranceNote: row.toleranceNote ?? "",
    decimalPlaces: row.decimalPlaces == null ? "" : String(row.decimalPlaces),
    logicalTestKey: row.logicalTestKey ?? "",
    logicalTestSequence: row.logicalTestSequence == null ? "" : String(row.logicalTestSequence),
    // LOGGER_SUMMARY has no representation in this two-value control; it falls
    // back to the DIRECT_REPLICATES display and the form is rendered locked
    // (entryStyleLocked below), so this fallback is never actually submitted.
    entryStyle: row.entryStyle === "DERIVED" ? "DERIVED" : "DIRECT_REPLICATES",
    derivation: row.derivation?.description ?? "",
    allowsRepeatedReadings: row.allowsRepeatedReadings,
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
  const { capabilities } = useAuthz();
  const parameterQuery = useDeviceCalibrationParameter(params.id);
  const updateMutation = useUpdateDeviceCalibrationParameter();

  const row = parameterQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceCalibrationParameterFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Phase 4C — Named Measurement Points (CalibrationTestPoint), embedded ──
  const testPointsQuery = useCalibrationTestPoints(params.id);
  const createTestPointMutation = useCreateCalibrationTestPoint();
  const updateTestPointMutation = useUpdateCalibrationTestPoint();
  const reorderTestPointsMutation = useReorderCalibrationTestPoints();
  const [addingTestPoint, setAddingTestPoint] = useState(false);
  const [testPointForm, setTestPointForm] = useState<CalibrationTestPointFormValue>(
    emptyCalibrationTestPointForm,
  );
  const [editingTestPointId, setEditingTestPointId] = useState<string | null>(null);
  const [editTestPointForm, setEditTestPointForm] = useState<CalibrationTestPointFormValue>(
    emptyCalibrationTestPointForm,
  );
  const [togglingTestPointId, setTogglingTestPointId] = useState<string | null>(null);
  const [reorderingTestPointId, setReorderingTestPointId] = useState<string | null>(null);
  const [testPointError, setTestPointError] = useState<string | null>(null);
  const [testPointSuccess, setTestPointSuccess] = useState<string | null>(null);

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
    isActive: "",
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
    setIsActive(row.isActive);
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
    setIsActive(row!.isActive);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCalibrationParameterUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.deviceTypeId) {
      setError("Device Name wajib dipilih.");
      return;
    }
    if (!form.capabilityItemId) {
      setError("Capability Item wajib dipilih.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    if (!form.uomId && row?.valueType === "NUMBER") {
      setError("UOM wajib dipilih.");
      return;
    }
    const limitError = validateCalibrationToleranceForm(form);
    if (limitError) {
      setError(limitError);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceCalibrationParameterUpdatePayload(
          { ...form, isActive },
          row!.entryStyle === "LOGGER_SUMMARY",
        ),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await parameterQuery.refetch();
    } catch (err) {
      setError(formatDeviceCalibrationParameterApiError(err));
    }
  }

  // ── Phase 4C — Named Measurement Points handlers ──────────────────────────

  function setTestPointField<K extends keyof CalibrationTestPointFormValue>(
    field: K,
    next: CalibrationTestPointFormValue[K],
  ) {
    setTestPointForm((prev) => ({ ...prev, [field]: next }));
  }

  function setEditTestPointField<K extends keyof CalibrationTestPointFormValue>(
    field: K,
    next: CalibrationTestPointFormValue[K],
  ) {
    setEditTestPointForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submitTestPoint(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCalibrationParameterCreate) return;
    setTestPointError(null);
    setTestPointSuccess(null);

    const validationError = validateCalibrationTestPointForm(testPointForm);
    if (validationError) {
      setTestPointError(validationError);
      return;
    }

    try {
      await createTestPointMutation.mutateAsync({
        parameterId: row!.id,
        input: buildCalibrationTestPointCreatePayload(testPointForm),
      });
      setTestPointSuccess("Titik ukur berhasil ditambahkan.");
      setAddingTestPoint(false);
      setTestPointForm(emptyCalibrationTestPointForm);
    } catch (err) {
      setTestPointError(formatCalibrationTestPointApiError(err));
    }
  }

  async function saveTestPoint(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCalibrationParameterUpdate || !editingTestPointId) return;
    setTestPointError(null);
    setTestPointSuccess(null);

    const validationError = validateCalibrationTestPointForm(editTestPointForm);
    if (validationError) {
      setTestPointError(validationError);
      return;
    }

    try {
      await updateTestPointMutation.mutateAsync({
        parameterId: row!.id,
        testPointId: editingTestPointId,
        input: buildCalibrationTestPointUpdatePayload(editTestPointForm),
      });
      setTestPointSuccess("Titik ukur berhasil diubah.");
      setEditingTestPointId(null);
    } catch (err) {
      setTestPointError(formatCalibrationTestPointApiError(err));
    }
  }

  async function toggleTestPointActive(testPoint: CalibrationTestPointApiRow) {
    if (!capabilities?.deviceCalibrationParameterUpdate) return;
    setTestPointError(null);
    setTestPointSuccess(null);
    setTogglingTestPointId(testPoint.id);
    try {
      await updateTestPointMutation.mutateAsync({
        parameterId: row!.id,
        testPointId: testPoint.id,
        input: { isActive: !testPoint.isActive },
      });
    } catch (err) {
      setTestPointError(formatCalibrationTestPointApiError(err));
    } finally {
      setTogglingTestPointId(null);
    }
  }

  async function moveTestPoint(testPoint: CalibrationTestPointApiRow, direction: "up" | "down") {
    if (!capabilities?.deviceCalibrationParameterUpdate) return;
    const ids = (testPointsQuery.data ?? []).map((p) => p.id);
    const nextIds = moveAdjacent(ids, testPoint.id, direction);
    if (nextIds === ids) return;

    setTestPointError(null);
    setTestPointSuccess(null);
    setReorderingTestPointId(testPoint.id);
    try {
      await reorderTestPointsMutation.mutateAsync({
        parameterId: row!.id,
        testPointIds: nextIds,
      });
    } catch (err) {
      setTestPointError(formatCalibrationTestPointApiError(err));
    } finally {
      setReorderingTestPointId(null);
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
            <DeviceCalibrationParameterStatusBadge isActive={row.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <DeviceCalibrationParameterFormFields
              value={form}
              onChange={setField}
              mode="edit"
              valueType={row.valueType}
              entryStyleLocked={row.entryStyle === "LOGGER_SUMMARY"}
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
            <dl className="mt-3 space-y-3 text-sm">
              <DetailField label="Device Name">
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

              <DetailField label="Tipe nilai">
                <span className="font-mono font-medium">{row.valueType}</span>
              </DetailField>

              <DetailField label="UOM">
                <span className="font-medium">
                  {row.uom ? `${row.uom.symbol} — ${row.uom.name}` : "—"}
                </span>
              </DetailField>

              <DetailField label="Batas penerimaan">
                <span className="font-medium">{formatCalibrationTolerance(row) ?? "—"}</span>
              </DetailField>

              <DetailField label="Decimal places">
                <span className="font-medium">
                  {row.valueType !== "NUMBER"
                    ? "— (tidak berlaku)"
                    : row.decimalPlaces == null
                      ? "Belum diatur"
                      : `${row.decimalPlaces} digit`}
                </span>
              </DetailField>

              <DetailField label="Uji gabungan">
                <span className="font-medium">
                  {row.logicalTestKey == null || row.logicalTestSequence == null
                    ? "— (parameter berdiri sendiri)"
                    : `${row.logicalTestKey} — urutan ${row.logicalTestSequence}`}
                </span>
              </DetailField>

              <DetailField label="Cara pengisian">
                <span className="font-medium">
                  {row.entryStyle === "DERIVED"
                    ? "Nilai turunan (dihitung manual oleh teknisi)"
                    : row.entryStyle === "LOGGER_SUMMARY"
                      ? "Logger summary"
                      : "Terukur langsung"}
                </span>
                {row.entryStyle === "DERIVED" && row.derivation?.description ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Diturunkan dari: {row.derivation.description}
                  </p>
                ) : null}
              </DetailField>

              <DetailField label="Ulangan">
                <span className="font-medium">
                  {row.allowsRepeatedReadings ? "Boleh diulang" : "Satu kali saja"}
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
              {capabilities.deviceCalibrationParameterUpdate ? (
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Surface>

      <Surface className={deviceCalibrationParameterFormSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Titik Ukur</h2>
            <p className="text-xs text-slate-500">Named Measurement Points</p>
          </div>
          {capabilities.deviceCalibrationParameterCreate && !addingTestPoint ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAddingTestPoint(true);
                setEditingTestPointId(null);
                setTestPointForm(emptyCalibrationTestPointForm);
                setTestPointError(null);
                setTestPointSuccess(null);
              }}
            >
              <Plus className="h-4 w-4" />
              Tambah Titik Ukur
            </Button>
          ) : null}
        </div>

        {testPointError ? <p className="mt-3 text-sm text-red-600">{testPointError}</p> : null}
        {testPointSuccess ? (
          <p className="mt-3 text-sm text-emerald-700">{testPointSuccess}</p>
        ) : null}

        {addingTestPoint ? (
          <form onSubmit={submitTestPoint} className="mt-4 rounded-md border border-slate-200 p-4">
            <CalibrationTestPointFormFields
              value={testPointForm}
              onChange={setTestPointField}
              mode="create"
              idPrefix="new-test-point"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAddingTestPoint(false);
                  setTestPointForm(emptyCalibrationTestPointForm);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createTestPointMutation.isPending}>
                <Save className="h-4 w-4" />
                {createTestPointMutation.isPending ? "Saving…" : "Save Titik Ukur"}
              </Button>
            </div>
          </form>
        ) : null}

        {testPointsQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-400">Memuat titik ukur…</p>
        ) : testPointsQuery.isError ? (
          <p className="mt-4 text-sm text-red-600">Gagal memuat titik ukur.</p>
        ) : (testPointsQuery.data?.length ?? 0) === 0 && !addingTestPoint ? (
          <div className="mt-4 text-sm text-slate-500">
            <p className="font-medium text-slate-600">Tidak ada titik ukur</p>
            <p className="mt-0.5">Parameter ini belum memiliki titik ukur bernama.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Nama Titik</th>
                  <th className="px-4 py-3">Setting</th>
                  <th className="px-4 py-3">Toleransi</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(testPointsQuery.data ?? []).map((testPoint, index) => (
                  <tr key={testPoint.id} className="align-top hover:bg-slate-50">
                    {editingTestPointId === testPoint.id ? (
                      <td colSpan={6} className="px-4 py-3">
                        <form onSubmit={saveTestPoint}>
                          <CalibrationTestPointFormFields
                            value={editTestPointForm}
                            onChange={setEditTestPointField}
                            mode="edit"
                            idPrefix={`edit-test-point-${testPoint.id}`}
                          />
                          <div className="mt-3 flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditingTestPointId(null)}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={updateTestPointMutation.isPending}>
                              <Save className="h-4 w-4" />
                              {updateTestPointMutation.isPending ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          <div className="flex items-center gap-1">
                            <span className="tabular-nums">{testPoint.sequence}</span>
                            {capabilities.deviceCalibrationParameterUpdate ? (
                              <div className="flex flex-col">
                                <button
                                  type="button"
                                  aria-label={`Naikkan urutan ${testPoint.settingLabel}`}
                                  className="text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                                  disabled={index === 0 || reorderingTestPointId !== null}
                                  onClick={() => moveTestPoint(testPoint, "up")}
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Turunkan urutan ${testPoint.settingLabel}`}
                                  className="text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                                  disabled={
                                    index === (testPointsQuery.data?.length ?? 0) - 1 ||
                                    reorderingTestPointId !== null
                                  }
                                  onClick={() => moveTestPoint(testPoint, "down")}
                                >
                                  ▼
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {testPoint.settingLabel}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {testPoint.settingValue == null || testPoint.settingValue === ""
                            ? "—"
                            : String(Number(testPoint.settingValue))}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {formatCalibrationTolerance(testPoint) ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <DeviceCalibrationParameterStatusBadge isActive={testPoint.isActive} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {capabilities.deviceCalibrationParameterUpdate ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleTestPointActive(testPoint)}
                                  disabled={togglingTestPointId === testPoint.id}
                                >
                                  {testPoint.isActive ? "Nonaktifkan" : "Aktifkan"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingTestPointId(testPoint.id);
                                    setAddingTestPoint(false);
                                    setEditTestPointForm(calibrationTestPointFormFromRow(testPoint));
                                    setTestPointError(null);
                                    setTestPointSuccess(null);
                                  }}
                                >
                                  Edit
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
