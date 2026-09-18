"use client";

import { useMemo, useState } from "react";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { ErrorBanner } from "../../../../components/feedback/error-banner";
import { formatApiError } from "../../../../lib/api-errors";
import {
  formatReadingDisplay,
  measuredValueDecimalPlacesExceededMessage,
  measuredValueInputStep,
  namedPointGroupView,
  readingDisplayValue,
  sortNamedMeasurementPoints,
  toleranceText,
  usesDirection,
  validateMeasuredDraft,
  measuredReadingPayload,
  type MeasurementBatchItem,
  type MeasurementDirection,
  type MeasurementUpdateInput,
  type TechMeasurementParameter,
  type TechMeasurementResult,
} from "../../../../lib/calibration/measurement";
import type { TechCalibrationJob } from "../../../../lib/calibration/types";
import { JobHeaderBlock } from "../job-detail-ui";
import { PassFailChip } from "./measurements-ui";

const BATCH_LIMIT = 200;

function cellKey(testPointId: string, direction: MeasurementDirection, replicateIndex: number): string {
  return `${testPointId}:${direction}:${replicateIndex}`;
}

function extraKey(testPointId: string, direction: MeasurementDirection): string {
  return `${testPointId}:${direction}`;
}

type GridEntryProps = {
  job: TechCalibrationJob;
  parameterId: string;
  param: TechMeasurementParameter;
  existingRows: TechMeasurementResult[];
  editable: boolean;
  lockedReason: string | null;
  onBatchCreate: (items: MeasurementBatchItem[]) => Promise<unknown>;
  onUpdate: (args: { measurementId: string; input: MeasurementUpdateInput }) => Promise<unknown>;
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
  const testPoints = sortNamedMeasurementPoints(param.testPoints ?? []);
  const directions: MeasurementDirection[] = usesDirection(param.code) ? ["UP", "DOWN"] : ["NONE"];
  const dp = param.decimalPlaces;
  const exampleHint = dp == null ? "12.3" : dp === 0 ? "120" : (12.3).toFixed(dp);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraByGroup, setExtraByGroup] = useState<Record<string, number>>({});
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

  const maxIndexByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of existingRows) {
      if (r.calibrationTestPointId === null) continue;
      const key = extraKey(r.calibrationTestPointId, r.direction);
      map.set(key, Math.max(map.get(key) ?? 0, r.replicateIndex));
    }
    return map;
  }, [existingRows]);

  const groups = testPoints.flatMap((tp) =>
    directions.map((direction) => {
      const groupKey = extraKey(tp.id, direction);
      const view = namedPointGroupView({
        testPoint: tp,
        maxExistingReplicateIndex: maxIndexByGroup.get(groupKey) ?? 0,
        extraSlots: extraByGroup[groupKey] ?? 0,
      });
      return { tp, direction, groupKey, view };
    }),
  );

  const draftFor = (key: string, existing: TechMeasurementResult | undefined): string => {
    if (key in drafts) return drafts[key]!;
    return readingDisplayValue(existing);
  };

  const setDraft = (key: string, value: string) => {
    setTouched(true);
    setSubmitError(null);
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const dirtyCells = groups
    .flatMap(({ tp, direction, view }) =>
      view.slots.map((slot) => {
        const key = cellKey(tp.id, direction, slot.replicateIndex);
        const existing = rowByKey.get(key);
        const value = draftFor(key, existing).trim();
        return { key, tp, direction, index: slot.replicateIndex, value, existing };
      }),
    )
    .filter(({ key, value, existing }) => {
      if (!(key in drafts)) return false;
      const stored = readingDisplayValue(existing).trim();
      return value !== stored;
    });

  const dirtyValidated = dirtyCells
    .filter(({ value }) => value !== "")
    .map((cell) => ({
      ...cell,
      validation: validateMeasuredDraft(cell.value, dp),
    }));
  const invalidDirty = dirtyValidated.filter((row) => !row.validation.ok);
  const hasInvalid = invalidDirty.length > 0;
  const precisionError = invalidDirty.find(
    (row) => !row.validation.ok && row.validation.reason === "decimal_places_exceeded",
  );
  const footerValidationMessage =
    precisionError &&
    !precisionError.validation.ok &&
    precisionError.validation.reason === "decimal_places_exceeded"
      ? measuredValueDecimalPlacesExceededMessage(precisionError.validation.decimalPlaces)
      : hasInvalid
        ? `Ada nilai yang tidak valid — gunakan angka (mis. ${exampleHint}) atau simbol dari alat.`
        : null;

  const saveable = dirtyValidated.flatMap(({ tp, direction, index, existing, validation }) => {
    const payload = measuredReadingPayload(validation);
    if (!payload) return [];
    return [{ tp, direction, index, existing, payload }];
  });
  const newItems: MeasurementBatchItem[] = saveable
    .filter(({ existing }) => !existing)
    .map(({ tp, direction, index, payload }) => ({
      deviceCalibrationParameterId: parameterId,
      calibrationTestPointId: tp.id,
      replicateIndex: index,
      direction,
      measuredValue: payload.measuredValue,
      measuredText: payload.measuredText,
    }));
  const updates = saveable
    .filter(({ existing }) => Boolean(existing))
    .map(({ existing, payload }) => ({
      measurementId: existing!.id,
      input: {
        measuredValue: payload.measuredValue,
        measuredText: payload.measuredText,
      },
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
            Satuan: {param.uom?.symbol ?? "—"} · Desimal: {dp == null ? "—" : dp} · {testPoints.length}{" "}
            titik ukur
          </p>
        </div>

        {lockedReason ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {lockedReason}
          </div>
        ) : null}

        {submitError ? <ErrorBanner message={submitError} /> : null}

        <div className="flex flex-col gap-4">
          {testPoints.map((tp) => {
            const pointGroups = groups.filter((g) => g.tp.id === tp.id);
            const usesDir = directions.length > 1;
            const anyNested = pointGroups.some((g) => g.view.showGroupHeader);
            const showPointHeader = usesDir || anyNested;
            return (
              <div key={tp.id} className="flex flex-col gap-3">
                {showPointHeader ? (
                  <div>
                    <p className="text-sm font-medium text-slate-800">{tp.settingLabel}</p>
                    {tp.settingValue ? (
                      <p className="text-xs text-slate-500">{tp.settingValue}</p>
                    ) : null}
                  </div>
                ) : tp.settingValue ? (
                  <p className="text-xs text-slate-500">{tp.settingValue}</p>
                ) : null}
                {pointGroups.map(({ direction, groupKey, view }) => {
                  const directionLabel =
                    direction === "UP" ? "Naik" : direction === "DOWN" ? "Turun" : null;
                  return (
                    <div key={groupKey} className="flex flex-col gap-2">
                      {directionLabel && view.showGroupHeader ? (
                        <p className="text-[11px] font-normal text-slate-500">{directionLabel}</p>
                      ) : null}
                      <ul className="flex flex-col gap-2">
                        {view.slots.map((slot) => {
                          const key = cellKey(tp.id, direction, slot.replicateIndex);
                          const existing = rowByKey.get(key);
                          const value = draftFor(key, existing);
                          const trimmed = value.trim();
                          const validation =
                            touched && trimmed !== ""
                              ? validateMeasuredDraft(trimmed, dp)
                              : { ok: true as const };
                          const invalid = !validation.ok;
                          const cardLabel =
                            directionLabel && !view.showGroupHeader
                              ? directionLabel
                              : slot.slotLabel;
                          return (
                            <li
                              key={key}
                              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
                            >
                              <span className="min-w-16 shrink-0 text-xs font-medium text-slate-500">
                                {cardLabel}
                              </span>
                              {editable ? (
                                <input
                                  inputMode="decimal"
                                  step={measuredValueInputStep(dp)}
                                  type="text"
                                  value={value}
                                  onChange={(e) => setDraft(key, e.target.value)}
                                  className={[
                                    "min-w-0 flex-1 rounded-lg border px-3 py-2 text-base",
                                    invalid ? "border-red-400" : "border-slate-300",
                                  ].join(" ")}
                                  placeholder={dp == null || dp === 0 ? "0" : (0).toFixed(dp)}
                                />
                              ) : (
                                <span className="min-w-0 flex-1 text-base text-slate-900">
                                  {formatReadingDisplay(existing, dp)}
                                </span>
                              )}
                              {existing ? (
                                <PassFailChip isWithinTolerance={existing.isWithinTolerance} />
                              ) : (
                                <span className="text-[11px] text-slate-400">belum disimpan</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {editable ? (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setExtraByGroup((prev) => ({
                              ...prev,
                              [groupKey]: (prev[groupKey] ?? 0) + 1,
                            }))
                          }
                        >
                          + Tambah ulangan
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-400">
          Setiap titik ukur wajib terisi. Tambah ulangan bila alat ini butuh lebih dari satu
          pembacaan per titik.
        </p>
      </div>
    </Screen>
  );
}
