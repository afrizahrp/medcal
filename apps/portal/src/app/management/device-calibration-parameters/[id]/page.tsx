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
  useDeviceCalibrationParameters,
  useUpdateDeviceCalibrationParameter,
} from "../use-device-calibration-parameters-query";
import {
  useCalibrationTestPoints,
  useCalibrationTestPointsForMany,
  useCreateCalibrationTestPoint,
  useCreateCalibrationTestPointsBulk,
  useReorderCalibrationTestPoints,
  useReorderCalibrationTestPointsGrouped,
  useUpdateCalibrationTestPoint,
  type CalibrationTestPointApiRow,
  type CalibrationTestPointGroupedReorderMove,
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
  toleranceMinInclusive: true,
  toleranceMaxInclusive: true,
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
    toleranceMinInclusive: row.toleranceMinInclusive !== false,
    toleranceMaxInclusive: row.toleranceMaxInclusive !== false,
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

/**
 * Capabilities whose sibling DeviceCalibrationParameters share matching
 * setpoints per sequence slot (e.g. NIBP's Systole/Mean/Diastole triples) and
 * so belong grouped under one shared NO. index in the Titik Ukur table.
 * Explicit CODE allowlist, not a raw DeviceCapability.id (ids are not stable
 * across environments) and NOT "any capability with multiple GRID
 * siblings" — most multi-item capabilities (e.g. ENVIRONMENTAL_CONDITIONS's
 * Room Temperature/Humidity/Voltage, ELECTRICAL_SAFETY's four checks, or
 * VITAL_SIGNS_MONITORING's independently-swept Heart Rate/Respirasi/SPO2)
 * are unrelated readings that must keep rendering flat. Mirrors the
 * capability-code-Set convention already used for gating in
 * apps/tech-pwa/src/lib/calibration/measurement.ts (DIRECTION_PARAMETER_CODES).
 */
const GROUPED_TITIK_UKUR_CAPABILITY_CODES = new Set(["NIBP"]);

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

  // ── Grouped Titik Ukur rendering — ONLY for capabilities on the
  // GROUPED_TITIK_UKUR_CAPABILITY_CODES allowlist (matching-setpoint sibling
  // families like NIBP's Systole/MAP/Diastole). Every other multi-sibling
  // capability (e.g. ENVIRONMENTAL_CONDITIONS, ELECTRICAL_SAFETY,
  // VITAL_SIGNS_MONITORING) renders the flat single-row table, unchanged.
  const isGroupedCapability = Boolean(
    row && GROUPED_TITIK_UKUR_CAPABILITY_CODES.has(row.capabilityItem.capability.code),
  );
  const siblingsQuery = useDeviceCalibrationParameters(
    {
      search: "",
      deviceTypeId: row?.deviceTypeId ?? "",
      capabilityId: row?.capabilityItem.capabilityId ?? "",
      capabilityItemId: "",
      uomId: "",
      isActive: true,
      sortBy: "name",
      sortDir: "asc",
      page: 1,
      pageSize: 100,
    },
    { enabled: isGroupedCapability },
  );
  // sortOrder is the persisted, MT-editable order within a capability (see
  // the parameter-order reorder endpoint) — NOT exposed as an API `sortBy`
  // option, so siblings are re-sorted client-side rather than relying on the
  // query's own order.
  const siblings = [...(siblingsQuery.data?.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const isGroupedTestPoints = isGroupedCapability && siblings.length > 1;
  const siblingIds = siblings.map((s) => s.id);
  const siblingTestPointQueries = useCalibrationTestPointsForMany(siblingIds);
  const groupedBulkMutation = useCreateCalibrationTestPointsBulk();
  const groupedReorderMutation = useReorderCalibrationTestPointsGrouped();

  const groupedSequences = Array.from(
    new Set(siblingTestPointQueries.flatMap((q) => (q.data ?? []).map((p) => p.sequence))),
  ).sort((a, b) => a - b);
  const groupedBaseline = groupedSequences.length ? Math.max(...groupedSequences) : 0;

  const [groupedEditing, setGroupedEditing] = useState<{
    parameterId: string;
    testPointId: string;
  } | null>(null);
  const [groupedEditForm, setGroupedEditForm] = useState<CalibrationTestPointFormValue>(
    emptyCalibrationTestPointForm,
  );
  const [groupedTogglingId, setGroupedTogglingId] = useState<string | null>(null);
  // Which block (by union-sequence index) the shared NO. chevron is
  // currently moving — one chevron pair per block, not one per sibling.
  const [groupedReorderingBlock, setGroupedReorderingBlock] = useState<number | null>(null);
  const [groupedAdding, setGroupedAdding] = useState(false);
  const [groupedAddLabel, setGroupedAddLabel] = useState("");
  const [groupedAddValues, setGroupedAddValues] = useState<Record<string, string>>({});
  const [groupedError, setGroupedError] = useState<string | null>(null);
  const [groupedSuccess, setGroupedSuccess] = useState<string | null>(null);

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

  // ── Grouped Titik Ukur handlers — same mutations as above, parameterized
  // by the specific sibling's own id, since each sub-row belongs to a
  // different DeviceCalibrationParameter than the one this page is for. ──

  function setGroupedEditField<K extends keyof CalibrationTestPointFormValue>(
    field: K,
    next: CalibrationTestPointFormValue[K],
  ) {
    setGroupedEditForm((prev) => ({ ...prev, [field]: next }));
  }

  async function toggleGroupedTestPointActive(
    parameterId: string,
    testPoint: CalibrationTestPointApiRow,
  ) {
    if (!capabilities?.deviceCalibrationParameterUpdate) return;
    setGroupedError(null);
    setGroupedSuccess(null);
    setGroupedTogglingId(testPoint.id);
    try {
      await updateTestPointMutation.mutateAsync({
        parameterId,
        testPointId: testPoint.id,
        input: { isActive: !testPoint.isActive },
      });
    } catch (err) {
      setGroupedError(formatCalibrationTestPointApiError(err));
    } finally {
      setGroupedTogglingId(null);
    }
  }

  /**
   * The grouped table's single chevron pair per NO. block — moves every
   * sibling present at this block's sequence together, in one atomic
   * request. A sibling with no test point at this sequence (blank sub-row)
   * is skipped, not errored; a sibling already at its own boundary is also
   * skipped (nothing to move for it), matching the approved corrective spec.
   */
  async function moveGroupedBlock(groupIndex: number, direction: "up" | "down") {
    if (!capabilities?.deviceCalibrationParameterUpdate) return;
    const sequence = groupedSequences[groupIndex];
    if (sequence === undefined) return;

    const moves: CalibrationTestPointGroupedReorderMove[] = [];
    siblings.forEach((sibling, siblingIndex) => {
      const ownPoints = siblingTestPointQueries[siblingIndex]?.data ?? [];
      const ownIds = ownPoints.map((p) => p.id);
      const testPoint = ownPoints.find((p) => p.sequence === sequence);
      if (!testPoint) return;
      const nextIds = moveAdjacent(ownIds, testPoint.id, direction);
      if (nextIds === ownIds) return;
      moves.push({ parameterId: sibling.id, testPointIds: nextIds });
    });
    if (moves.length === 0) return;

    setGroupedError(null);
    setGroupedSuccess(null);
    setGroupedReorderingBlock(groupIndex);
    try {
      await groupedReorderMutation.mutateAsync(moves);
    } catch (err) {
      setGroupedError(formatCalibrationTestPointApiError(err));
    } finally {
      setGroupedReorderingBlock(null);
    }
  }

  async function saveGroupedTestPoint(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCalibrationParameterUpdate || !groupedEditing) return;
    setGroupedError(null);
    setGroupedSuccess(null);

    const validationError = validateCalibrationTestPointForm(groupedEditForm);
    if (validationError) {
      setGroupedError(validationError);
      return;
    }

    try {
      await updateTestPointMutation.mutateAsync({
        parameterId: groupedEditing.parameterId,
        testPointId: groupedEditing.testPointId,
        input: buildCalibrationTestPointUpdatePayload(groupedEditForm),
      });
      setGroupedSuccess("Titik ukur berhasil diubah.");
      setGroupedEditing(null);
    } catch (err) {
      setGroupedError(formatCalibrationTestPointApiError(err));
    }
  }

  async function submitGroupedAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCalibrationParameterCreate) return;
    setGroupedError(null);
    setGroupedSuccess(null);

    const label = groupedAddLabel.trim();
    if (!label) {
      setGroupedError("Nama Titik wajib diisi.");
      return;
    }

    const values: Record<string, { settingValue: number } | null> = {};
    for (const siblingId of siblingIds) {
      const raw = (groupedAddValues[siblingId] ?? "").trim();
      if (raw === "") {
        values[siblingId] = null;
        continue;
      }
      if (!Number.isFinite(Number(raw))) {
        setGroupedError("Setting tidak valid.");
        return;
      }
      values[siblingId] = { settingValue: Number(raw) };
    }

    try {
      await groupedBulkMutation.mutateAsync({
        parameterIds: siblingIds,
        rows: [{ settingLabel: label, sequence: groupedBaseline + 1, values }],
      });
      setGroupedSuccess("Titik ukur grup berhasil ditambahkan.");
      setGroupedAdding(false);
      setGroupedAddLabel("");
      setGroupedAddValues({});
    } catch (err) {
      setGroupedError(formatCalibrationTestPointApiError(err));
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
          {capabilities.deviceCalibrationParameterCreate && !addingTestPoint && !groupedAdding ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingTestPointId(null);
                setTestPointError(null);
                setTestPointSuccess(null);
                setGroupedEditing(null);
                setGroupedError(null);
                setGroupedSuccess(null);
                if (isGroupedTestPoints) {
                  setGroupedAdding(true);
                  setGroupedAddLabel("");
                  setGroupedAddValues({});
                } else {
                  setAddingTestPoint(true);
                  setTestPointForm(emptyCalibrationTestPointForm);
                }
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
        {groupedError ? <p className="mt-3 text-sm text-red-600">{groupedError}</p> : null}
        {groupedSuccess ? (
          <p className="mt-3 text-sm text-emerald-700">{groupedSuccess}</p>
        ) : null}

        {!isGroupedTestPoints && addingTestPoint ? (
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

        {isGroupedTestPoints && groupedAdding ? (
          <form
            onSubmit={submitGroupedAdd}
            className="mt-4 rounded-md border border-slate-200 p-4"
          >
            <div>
              <label
                htmlFor="grouped-add-settingLabel"
                className="block text-sm font-medium text-slate-700"
              >
                Nama Titik <span className="text-red-500">*</span>
              </label>
              <input
                id="grouped-add-settingLabel"
                value={groupedAddLabel}
                onChange={(e) => setGroupedAddLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-xs placeholder:text-slate-400"
                placeholder="Titik 1"
                maxLength={150}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Berlaku untuk semua parameter di bawah ini.</p>
            </div>
            <div className="mt-3 space-y-3">
              {siblings.map((sibling) => (
                <div key={sibling.id}>
                  <label
                    htmlFor={`grouped-add-value-${sibling.id}`}
                    className="block text-sm font-medium text-slate-700"
                  >
                    Setting — {sibling.capabilityItem.name}
                  </label>
                  <input
                    id={`grouped-add-value-${sibling.id}`}
                    type="number"
                    step="any"
                    value={groupedAddValues[sibling.id] ?? ""}
                    onChange={(e) =>
                      setGroupedAddValues((prev) => ({ ...prev, [sibling.id]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-xs placeholder:text-slate-400"
                    placeholder="25"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setGroupedAdding(false);
                  setGroupedAddLabel("");
                  setGroupedAddValues({});
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={groupedBulkMutation.isPending}>
                <Save className="h-4 w-4" />
                {groupedBulkMutation.isPending ? "Saving…" : "Save Titik Ukur"}
              </Button>
            </div>
          </form>
        ) : null}

        {isGroupedTestPoints ? (
          siblingsQuery.isLoading || siblingTestPointQueries.some((q) => q.isLoading) ? (
            <p className="mt-4 text-sm text-slate-400">Memuat titik ukur…</p>
          ) : groupedSequences.length === 0 && !groupedAdding ? (
            <div className="mt-4 text-sm text-slate-500">
              <p className="font-medium text-slate-600">Tidak ada titik ukur</p>
              <p className="mt-0.5">Grup parameter ini belum memiliki titik ukur bernama.</p>
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
                  {groupedSequences.map((sequence, groupIndex) =>
                    siblings.map((sibling, siblingIndex) => {
                      const ownPoints = siblingTestPointQueries[siblingIndex]?.data ?? [];
                      const testPoint = ownPoints.find((p) => p.sequence === sequence);
                      const rowKey = `${sequence}-${sibling.id}`;
                      const isEditingThis =
                        testPoint != null &&
                        groupedEditing?.parameterId === sibling.id &&
                        groupedEditing.testPointId === testPoint.id;

                      return (
                        <tr key={rowKey} className="align-top hover:bg-slate-50">
                          {siblingIndex === 0 ? (
                            <td
                              rowSpan={siblings.length}
                              className="border-r border-slate-100 px-4 py-3 text-sm text-slate-600"
                            >
                              <div className="flex items-center gap-1">
                                <span className="tabular-nums">{groupIndex + 1}</span>
                                {capabilities.deviceCalibrationParameterUpdate ? (
                                  <div className="flex flex-col">
                                    <button
                                      type="button"
                                      aria-label={`Naikkan urutan blok ${groupIndex + 1}`}
                                      className="text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                                      disabled={groupIndex === 0 || groupedReorderingBlock !== null}
                                      onClick={() => moveGroupedBlock(groupIndex, "up")}
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Turunkan urutan blok ${groupIndex + 1}`}
                                      className="text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                                      disabled={
                                        groupIndex === groupedSequences.length - 1 ||
                                        groupedReorderingBlock !== null
                                      }
                                      onClick={() => moveGroupedBlock(groupIndex, "down")}
                                    >
                                      ▼
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          ) : null}

                          {testPoint == null ? (
                            <>
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {sibling.capabilityItem.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-400" colSpan={4}>
                                — belum ada titik ukur pada urutan ini
                              </td>
                            </>
                          ) : isEditingThis ? (
                            <td colSpan={5} className="px-4 py-3">
                              <form onSubmit={saveGroupedTestPoint}>
                                <CalibrationTestPointFormFields
                                  value={groupedEditForm}
                                  onChange={setGroupedEditField}
                                  mode="edit"
                                  idPrefix={`grouped-edit-test-point-${testPoint.id}`}
                                />
                                <div className="mt-3 flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setGroupedEditing(null)}
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
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {sibling.capabilityItem.name}
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
                                        onClick={() =>
                                          toggleGroupedTestPointActive(sibling.id, testPoint)
                                        }
                                        disabled={groupedTogglingId === testPoint.id}
                                      >
                                        {testPoint.isActive ? "Nonaktifkan" : "Aktifkan"}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setGroupedEditing({
                                            parameterId: sibling.id,
                                            testPointId: testPoint.id,
                                          });
                                          setGroupedAdding(false);
                                          setGroupedEditForm(
                                            calibrationTestPointFormFromRow(testPoint),
                                          );
                                          setGroupedError(null);
                                          setGroupedSuccess(null);
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
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          )
        ) : testPointsQuery.isLoading ? (
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
