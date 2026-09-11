"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { formatDeviceCalibrationParameterApiError } from "../device-calibration-parameter-form-fields";
import {
  PageHeader,
  Surface,
  deviceCalibrationParameterFormActionsClass,
  deviceCalibrationParameterFormPageClass,
  deviceCalibrationParameterFormSurfaceClass,
  selectClassName,
  type DeviceCalibrationParameterRow,
} from "../device-calibration-parameters-ui";
import {
  useCopyDeviceCalibrationParameters,
  useDeviceCalibrationParameters,
  type DeviceCalibrationParameterCopyResponse,
} from "../use-device-calibration-parameters-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";

/** A parameter can only be copied through today's create path when it is a
 * plain typed reading — Pattern B / LOGGER_SUMMARY parameters have
 * CalibrationTestPoint children with no create endpoint yet (see Stage 2
 * design doc §2.3). Copying those silently would produce a parameter that
 * looks like Pattern A but is missing its test points. */
function isCopyable(row: DeviceCalibrationParameterRow): boolean {
  return row.entryStyle === "DIRECT_REPLICATES" && row.valueType === "NUMBER";
}

interface CapabilityGroup {
  capability: { id: string; name: string };
  parameters: DeviceCalibrationParameterRow[];
}

function groupByCapability(rows: DeviceCalibrationParameterRow[]): CapabilityGroup[] {
  const byCapability = new Map<string, CapabilityGroup>();
  for (const row of rows) {
    const capability = row.capabilityItem.capability;
    let group = byCapability.get(capability.id);
    if (!group) {
      group = { capability: { id: capability.id, name: capability.name }, parameters: [] };
      byCapability.set(capability.id, group);
    }
    group.parameters.push(row);
  }
  const groups = [...byCapability.values()];
  groups.sort((a, b) => a.capability.name.localeCompare(b.capability.name, undefined, { sensitivity: "base" }));
  for (const group of groups) {
    group.parameters.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }
  return groups;
}

function CapabilityCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 rounded border-slate-300"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="Pilih semua parameter pada capability ini"
    />
  );
}

function CopyResultSummary({ result }: { result: DeviceCalibrationParameterCopyResponse }) {
  return (
    <div className="mb-4 space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <p className="font-medium text-emerald-800">
        {result.created.length} parameter berhasil disalin.
        {result.skippedDuplicateName.length > 0 || result.skippedUnsupportedEntryStyle.length > 0
          ? " Beberapa parameter dilewati:"
          : ""}
      </p>
      {result.skippedDuplicateName.length > 0 ? (
        <div className="text-amber-800">
          <p className="font-medium">
            {result.skippedDuplicateName.length} dilewati — nama sudah ada di Device Name tujuan:
          </p>
          <ul className="ml-4 list-disc">
            {result.skippedDuplicateName.map((row) => (
              <li key={row.sourceParameterId}>{row.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.skippedUnsupportedEntryStyle.length > 0 ? (
        <div className="text-amber-800">
          <p className="font-medium">
            {result.skippedUnsupportedEntryStyle.length} dilewati — perlu dibuat manual (bukan pengukuran
            langsung sederhana):
          </p>
          <ul className="ml-4 list-disc">
            {result.skippedUnsupportedEntryStyle.map((row) => (
              <li key={row.sourceParameterId}>{row.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function CopyDeviceCalibrationParametersPage() {
  const searchParams = useSearchParams();
  const { capabilities } = useAuthz();
  const copyMutation = useCopyDeviceCalibrationParameters();

  const [sourceDeviceTypeId, setSourceDeviceTypeId] = useState("");
  const [targetDeviceTypeId, setTargetDeviceTypeId] = useState(
    () => searchParams.get("targetDeviceTypeId") ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeviceCalibrationParameterCopyResponse | null>(null);

  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const deviceTypes = typesQuery.data?.data ?? [];
  const sourceDeviceType = deviceTypes.find((t) => t.id === sourceDeviceTypeId);
  const targetDeviceType = deviceTypes.find((t) => t.id === targetDeviceTypeId);

  const sourceParametersQuery = useDeviceCalibrationParameters(
    {
      search: "",
      deviceTypeId: sourceDeviceTypeId,
      capabilityId: "",
      capabilityItemId: "",
      uomId: "",
      isActive: true,
      sortBy: "name",
      sortDir: "asc",
      page: 1,
      pageSize: 500,
    },
    { enabled: Boolean(sourceDeviceTypeId) },
  );

  const groups = useMemo(
    () => groupByCapability(sourceParametersQuery.data?.data ?? []),
    [sourceParametersQuery.data],
  );

  // Selection does not carry over across a source-device switch.
  function changeSource(id: string) {
    setSourceDeviceTypeId(id);
    setSelected(new Set());
    setResult(null);
    setError(null);
  }

  function toggleParameter(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCapability(group: CapabilityGroup) {
    const selectableIds = group.parameters.filter(isCopyable).map((p) => p.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of selectableIds) next.delete(id);
      } else {
        for (const id of selectableIds) next.add(id);
      }
      return next;
    });
  }

  if (!capabilities?.deviceCalibrationParameterCreate) {
    return <AccessDenied />;
  }

  const canSubmit =
    Boolean(sourceDeviceTypeId) &&
    Boolean(targetDeviceTypeId) &&
    sourceDeviceTypeId !== targetDeviceTypeId &&
    selected.size > 0 &&
    !copyMutation.isPending;

  async function submit() {
    setError(null);
    setResult(null);
    try {
      const response = await copyMutation.mutateAsync({
        sourceDeviceTypeId,
        targetDeviceTypeId,
        parameterIds: [...selected],
      });
      setResult(response);
      setSelected(new Set());
    } catch (err) {
      setError(formatDeviceCalibrationParameterApiError(err));
    }
  }

  return (
    <div className={deviceCalibrationParameterFormPageClass}>
      <PageHeader
        title="Copy Calibration Parameter"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-calibration-parameters", label: "Calibration Parameter" },
          { label: "Copy" },
        ]}
      />

      <Surface className={deviceCalibrationParameterFormSurfaceClass}>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {result ? <CopyResultSummary result={result} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sourceDeviceTypeId" className="block text-sm font-medium text-slate-700">
              Salin dari Device Name <span className="text-red-500">*</span>
            </label>
            <select
              id="sourceDeviceTypeId"
              value={sourceDeviceTypeId}
              onChange={(e) => changeSource(e.target.value)}
              className={`${selectClassName} mt-1 w-full`}
              disabled={typesQuery.isLoading}
            >
              <option value="">Pilih Device Name sumber…</option>
              {deviceTypes
                .filter((t) => t.id !== targetDeviceTypeId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="targetDeviceTypeId" className="block text-sm font-medium text-slate-700">
              Salin ke Device Name <span className="text-red-500">*</span>
            </label>
            <select
              id="targetDeviceTypeId"
              value={targetDeviceTypeId}
              onChange={(e) => {
                setTargetDeviceTypeId(e.target.value);
                setResult(null);
                setError(null);
              }}
              className={`${selectClassName} mt-1 w-full`}
              disabled={typesQuery.isLoading}
            >
              <option value="">Pilih Device Name tujuan…</option>
              {deviceTypes
                .filter((t) => t.id !== sourceDeviceTypeId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {sourceDeviceTypeId && targetDeviceTypeId && sourceDeviceTypeId === targetDeviceTypeId ? (
          <p className="mt-3 text-sm text-red-600">
            Device Name sumber dan tujuan tidak boleh sama.
          </p>
        ) : null}

        {sourceDeviceTypeId ? (
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Pilih Capability / Parameter dari {sourceDeviceType?.name ?? "…"}
            </h2>
            {sourceParametersQuery.isLoading ? (
              <p className="mt-3 text-sm text-slate-400">Memuat parameter…</p>
            ) : groups.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                {sourceDeviceType?.name ?? "Device Name ini"} belum punya Calibration Parameter aktif.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
                {groups.map((group) => {
                  const selectableIds = group.parameters.filter(isCopyable).map((p) => p.id);
                  const selectedCount = selectableIds.filter((id) => selected.has(id)).length;
                  return (
                    <div key={group.capability.id} className="p-3">
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <CapabilityCheckbox
                          checked={selectableIds.length > 0 && selectedCount === selectableIds.length}
                          indeterminate={selectedCount > 0 && selectedCount < selectableIds.length}
                          onChange={() => toggleCapability(group)}
                          disabled={selectableIds.length === 0}
                        />
                        {group.capability.name}
                        <span className="font-normal text-slate-400">
                          · {selectedCount}/{group.parameters.length} dipilih
                        </span>
                      </label>
                      <div className="mt-2 space-y-1.5 pl-6">
                        {group.parameters.map((row) => {
                          const copyable = isCopyable(row);
                          return (
                            <label
                              key={row.id}
                              className={`flex items-center gap-2 text-sm ${
                                copyable ? "text-slate-700" : "text-slate-400"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300"
                                checked={selected.has(row.id)}
                                disabled={!copyable}
                                onChange={() => toggleParameter(row.id)}
                              />
                              {row.name}
                              {!copyable ? (
                                <span className="text-xs text-amber-600">
                                  Tidak bisa dicopy — perlu dibuat manual
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className={deviceCalibrationParameterFormActionsClass}>
          <Button type="button" variant="outline" asChild>
            <Link href="/device-calibration-parameters">Batal</Link>
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            <Copy className="h-4 w-4" />
            {copyMutation.isPending ? "Menyalin…" : `Copy ${selected.size || ""} Parameter`.trim()}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
