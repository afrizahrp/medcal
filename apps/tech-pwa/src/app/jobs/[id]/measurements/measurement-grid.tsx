"use client";

import { useMemo, useState } from "react";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { ErrorBanner } from "../../../../components/feedback/error-banner";
import { formatApiError } from "../../../../lib/api-errors";
import {
  expectedReplicateCount,
  formatMeasuredValue,
  measuredValueDecimalPlacesExceededMessage,
  measuredValueInputStep,
  toleranceText,
  usesDirection,
  validateMeasuredValue,
  type MeasurementBatchItem,
  type MeasurementDirection,
  type TechMeasurementParameter,
  type TechMeasurementResult,
} from "../../../../lib/calibration/measurement";
import type { TechCalibrationJob } from "../../../../lib/calibration/types";
import { JobHeaderBlock } from "../job-detail-ui";
import { PassFailChip } from "./measurements-ui";

const BATCH_LIMIT = 200;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"] as const;

function replicateHeader(index: number): string {
  return ROMAN[index - 1] ?? String(index);
}

function cellKey(testPointId: string, direction: MeasurementDirection, replicateIndex: number): string {
  return `${testPointId}:${direction}:${replicateIndex}`;
}

type GridEntryProps = {
  job: TechCalibrationJob;
  parameterId: string;
  param: TechMeasurementParameter;
  existingRows: TechMeasurementResult[];
  editable: boolean;
  lockedReason: string | null;
  onBatchCreate: (items: MeasurementBatchItem[]) => Promise<unknown>;
  onUpdate: (args: { measurementId: string; input: { measuredValue: string } }) => Promise<unknown>;
  onRefetch: () => Promise<unknown>;
};

export function MeasurementGridEntry({
  job,
  parameterId,
  param,
  existingRows,
  editable,
  lockedReason,
  onBatchCreate,
  onUpdate,
  onRefetch,
}: GridEntryProps) {
  const testPoints = [...(param.testPoints ?? [])].sort((a, b) => a.sequence - b.sequence);
  const directions: MeasurementDirection[] = usesDirection(param.code) ? ["UP", "DOWN"] : ["NONE"];
  const expected = expectedReplicateCount(param.code);
  const dp = param.decimalPlaces;
  const exampleHint = dp == null ? "12.3" : dp === 0 ? "120" : (12.3).toFixed(dp);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraCols, setExtraCols] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const rowByKey = useMemo(() => {
    const map = new Map<string, TechMeasurementResult>();
    for (const r of existingRows) {
      if (r.calibrationTestPointId === null) continue;
      map.set(cellKey(r.calibrationTestPointId, r.direction, r.replicateIndex), r);
    }
    return map;
  }, [existingRows]);

  const maxExistingIndex = existingRows.reduce((m, r) => Math.max(m, r.replicateIndex), 0);
  const colCount = Math.max(expected, maxExistingIndex) + extraCols;
  const indices = Array.from({ length: colCount }, (_, i) => i + 1);

  const draftFor = (key: string, existing: TechMeasurementResult | undefined): string => {
    if (key in drafts) return drafts[key]!;
    return existing?.measuredValue ?? "";
  };

  const setDraft = (key: string, value: string) => {
    setTouched(true);
    setSubmitError(null);
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const dirtyCells = testPoints.flatMap((tp) =>
    directions.flatMap((direction) =>
      indices.map((index) => {
        const key = cellKey(tp.id, direction, index);
        const existing = rowByKey.get(key);
        const value = draftFor(key, existing).trim();
        return { key, tp, direction, index, value, existing };
      }),
    ),
  ).filter(({ key, value, existing }) => {
    if (!(key in drafts)) return false;
    const stored = existing?.measuredValue ?? "";
    return value !== stored.trim();
  });

  const invalidDirty = dirtyCells
    .filter(({ value }) => value !== "")
    .map(({ value }) => validateMeasuredValue(value, dp))
    .filter((result) => !result.ok);
  const hasInvalid = invalidDirty.length > 0;
  const precisionError = invalidDirty.find((result) => result.reason === "decimal_places_exceeded");
  const footerValidationMessage =
    precisionError && precisionError.reason === "decimal_places_exceeded"
      ? measuredValueDecimalPlacesExceededMessage(precisionError.decimalPlaces)
      : hasInvalid
        ? `Ada nilai yang tidak valid — gunakan angka (mis. ${exampleHint}).`
        : null;
  const newItems: MeasurementBatchItem[] = dirtyCells
    .filter(({ value, existing }) => value !== "" && !existing)
    .map(({ tp, direction, index, value }) => ({
      deviceCalibrationParameterId: parameterId,
      calibrationTestPointId: tp.id,
      replicateIndex: index,
      direction,
      measuredValue: value,
    }));
  const updates = dirtyCells
    .filter(({ value, existing }) => existing && value !== "")
    .map(({ value, existing }) => ({
      measurementId: existing!.id,
      input: { measuredValue: value },
    }));
  const nothingToSave = newItems.length === 0 && updates.length === 0;

  async function handleSave() {
    setSubmitError(null);
    setSaving(true);
    try {
      for (let i = 0; i < newItems.length; i += BATCH_LIMIT) {
        await onBatchCreate(newItems.slice(i, i + BATCH_LIMIT));
      }
      for (const u of updates) await onUpdate(u);
      await onRefetch();
      setDrafts({});
      setTouched(false);
    } catch (err) {
      setSubmitError(formatApiError(err, "Gagal menyimpan pembacaan."));
      await onRefetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={param.name}
      showBack
      footer={
        editable ? (
          <StickyActionBar>
            {footerValidationMessage ? (
              <p className="text-center text-xs text-red-600">{footerValidationMessage}</p>
            ) : null}
            <Button
              fullWidth
              disabled={saving || nothingToSave || hasInvalid}
              onClick={() => void handleSave()}
            >
              {saving ? "Menyimpan…" : "Simpan pembacaan"}
            </Button>
          </StickyActionBar>
        ) : undefined
      }
    >
      <JobHeaderBlock job={job} />
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="text-slate-500">
            {param.capabilityName} › {param.capabilityItemName}
          </p>
          <p className="mt-1 text-slate-900">
            Toleransi: <span className="font-medium">{toleranceText(param)}</span>
          </p>
          <p className="mt-0.5 text-slate-600">
            Satuan: {param.uom?.symbol ?? "—"} · Desimal: {dp == null ? "—" : dp} ·{" "}
            {testPoints.length} titik uji · {colCount} ulangan
          </p>
        </div>

        {lockedReason ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {lockedReason}
          </div>
        ) : null}

        {submitError ? <ErrorBanner message={submitError} /> : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-10 min-w-[7rem] bg-white px-3 py-2 text-left text-xs font-semibold text-slate-500 shadow-[1px_0_0_0_#e2e8f0]">
                  Setpoint
                </th>
                {indices.map((index) => (
                  <th
                    key={index}
                    className="min-w-[5.5rem] px-2 py-2 text-center text-xs font-semibold text-slate-500"
                  >
                    {replicateHeader(index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {testPoints.flatMap((tp) =>
                directions.map((direction) => {
                  const rowLabel =
                    direction === "NONE" ? (
                      tp.settingLabel
                    ) : (
                      <span>
                        <span className="block">{tp.settingLabel}</span>
                        <span className="text-[11px] font-normal text-slate-500">
                          {direction === "UP" ? "Naik" : "Turun"}
                        </span>
                      </span>
                    );
                  return (
                    <tr key={`${tp.id}:${direction}`} className="border-b border-slate-100 last:border-0">
                      <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-[1px_0_0_0_#e2e8f0]">
                        {rowLabel}
                      </th>
                      {indices.map((index) => {
                        const key = cellKey(tp.id, direction, index);
                        const existing = rowByKey.get(key);
                        const value = draftFor(key, existing);
                        const trimmed = value.trim();
                        const validation =
                          touched && trimmed !== ""
                            ? validateMeasuredValue(trimmed, dp)
                            : { ok: true as const };
                        const invalid = !validation.ok;
                        return (
                          <td key={key} className="px-2 py-2 align-top">
                            {editable ? (
                              <input
                                inputMode="decimal"
                                step={measuredValueInputStep(dp)}
                                type="number"
                                value={value}
                                onChange={(e) => setDraft(key, e.target.value)}
                                className={[
                                  "w-full min-w-[4.5rem] rounded-md border px-2 py-1.5 text-base",
                                  invalid ? "border-red-400" : "border-slate-300",
                                ].join(" ")}
                                placeholder={dp == null || dp === 0 ? "0" : (0).toFixed(dp)}
                              />
                            ) : (
                              <span className="block text-base text-slate-900">
                                {formatMeasuredValue(existing?.measuredValue ?? null, dp)}
                              </span>
                            )}
                            <span className="mt-1 block">
                              {existing ? (
                                <PassFailChip isWithinTolerance={existing.isWithinTolerance} />
                              ) : (
                                <span className="text-[10px] text-slate-400">belum disimpan</span>
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>

        {editable ? (
          <Button variant="ghost" onClick={() => setExtraCols((n) => n + 1)}>
            + Tambah ulangan
          </Button>
        ) : null}

        <p className="text-xs text-slate-400">
          Standar lembar kerja untuk parameter ini mencatat {expected} ulangan. Tambah kolom bila
          alat ini butuh lebih.
        </p>
      </div>
    </Screen>
  );
}
