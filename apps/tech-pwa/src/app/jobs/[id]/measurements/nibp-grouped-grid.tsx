"use client";

import { useMemo, useState } from "react";
import { Screen } from "../../../../components/layout/screen";
import { StickyActionBar } from "../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../components/ui/button";
import { ErrorBanner } from "../../../../components/feedback/error-banner";
import { formatApiError } from "../../../../lib/api-errors";
import {
  canAddReplicateSlot,
  formatReadingDisplay,
  measuredReadingPayload,
  measuredValueDecimalPlacesExceededMessage,
  measuredValueInputStep,
  namedPointGroupView,
  patternBEntryPresentation,
  readingDisplayValue,
  sortNamedMeasurementPoints,
  toleranceText,
  usesDirection,
  validateMeasuredDraft,
  type MeasurementBatchItem,
  type MeasurementDirection,
  type MeasurementUpdateInput,
  type TechMeasurementParameter,
  type TechMeasurementResult,
  type TechMeasurementTestPoint,
} from "../../../../lib/calibration/measurement";
import type { TechCalibrationJob } from "../../../../lib/calibration/types";
import { JobHeaderBlock } from "../job-detail-ui";
import { PassFailChip } from "./measurements-ui";

const BATCH_LIMIT = 200;

function cellKey(
  parameterId: string,
  testPointId: string,
  direction: MeasurementDirection,
  replicateIndex: number,
): string {
  return `${parameterId}:${testPointId}:${direction}:${replicateIndex}`;
}

/**
 * One physical reading on the simulator produces Systole + Mean + Diastole at
 * once, so "+ Tambah ulangan" adds a slot to all 3 siblings simultaneously —
 * keyed by block (sequence + direction), not by sibling.
 */
function blockExtraKey(sequence: number, direction: MeasurementDirection): string {
  return `${sequence}:${direction}`;
}

type NibpGroupedGridProps = {
  job: TechCalibrationJob;
  /** Capability's sibling parameters, in API (persisted sortOrder) order — Systole, Mean, Diastole. */
  siblings: TechMeasurementParameter[];
  /** Current-attempt rows for these siblings only, named points only. */
  existingRows: TechMeasurementResult[];
  editable: boolean;
  lockedReason: string | null;
  onBatchCreate: (items: MeasurementBatchItem[]) => Promise<unknown>;
  onUpdate: (args: { measurementId: string; input: MeasurementUpdateInput }) => Promise<unknown>;
  onRefetch: () => Promise<unknown>;
};

export function NibpGroupedGrid({
  job,
  siblings,
  existingRows,
  editable,
  lockedReason,
  onBatchCreate,
  onUpdate,
  onRefetch,
}: NibpGroupedGridProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraByBlock, setExtraByBlock] = useState<Record<string, number>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const siblingsWithPoints = useMemo(
    () =>
      siblings.map((sibling) => ({
        sibling,
        testPoints: sortNamedMeasurementPoints(sibling.testPoints ?? []),
        directions: (usesDirection(sibling.code) ? ["UP", "DOWN"] : ["NONE"]) as MeasurementDirection[],
      })),
    [siblings],
  );

  const sequences = useMemo(() => {
    const set = new Set<number>();
    for (const { testPoints } of siblingsWithPoints) {
      for (const tp of testPoints) set.add(tp.sequence);
    }
    return [...set].sort((a, b) => a - b);
  }, [siblingsWithPoints]);

  const rowByKey = useMemo(() => {
    const map = new Map<string, TechMeasurementResult>();
    for (const r of existingRows) {
      if (r.calibrationTestPointId === null) continue;
      map.set(cellKey(r.deviceCalibrationParameterId, r.calibrationTestPointId, r.direction, r.replicateIndex), r);
    }
    return map;
  }, [existingRows]);

  // Flat (sibling × testPoint × direction) groups — drives save + counter.
  // Rendering re-walks `sequences` for the stacked-block layout.
  const groups = siblingsWithPoints.flatMap(({ sibling, testPoints, directions }) =>
    testPoints.flatMap((tp) =>
      directions.map((direction) => {
        const blockKey = blockExtraKey(tp.sequence, direction);
        const extra = extraByBlock[blockKey] ?? 0;
        const [view] = patternBEntryPresentation(
          [tp],
          existingRows.filter(
            (row) => row.deviceCalibrationParameterId === sibling.id && row.direction === direction,
          ),
          { [tp.id]: extra },
        );
        return {
          sibling,
          tp,
          direction,
          blockKey,
          view:
            view ??
            namedPointGroupView({ testPoint: tp, maxExistingReplicateIndex: 0, extraSlots: extra }),
        };
      }),
    ),
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

  // "X/21 filled" — one (parameter, testPoint) pair counts filled once any of
  // its slots holds a non-empty value (draft-aware, mirrors the server's
  // per-point completeness granularity). Purely local; never calls the API.
  const { filledPairCount, totalPairCount } = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const { sibling, testPoints } of siblingsWithPoints) {
      for (const tp of testPoints) {
        total += 1;
        const anyFilled = groups.some(
          (g) =>
            g.sibling.id === sibling.id &&
            g.tp.id === tp.id &&
            g.view.slots.some((slot) => {
              const key = cellKey(sibling.id, tp.id, g.direction, slot.replicateIndex);
              return draftFor(key, rowByKey.get(key)).trim() !== "";
            }),
        );
        if (anyFilled) filled += 1;
      }
    }
    return { filledPairCount: filled, totalPairCount: total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblingsWithPoints, groups, drafts, rowByKey]);

  const dirtyCells = groups
    .flatMap(({ sibling, tp, direction, view }) =>
      view.slots.map((slot) => {
        const key = cellKey(sibling.id, tp.id, direction, slot.replicateIndex);
        const existing = rowByKey.get(key);
        const value = draftFor(key, existing).trim();
        return { key, sibling, tp, direction, index: slot.replicateIndex, value, existing };
      }),
    )
    .filter(({ key, value, existing }) => {
      if (!(key in drafts)) return false;
      const stored = readingDisplayValue(existing).trim();
      return value !== stored;
    });

  const dp0Hint = "120";
  const dirtyValidated = dirtyCells
    .filter(({ value }) => value !== "")
    .map((cell) => ({
      ...cell,
      validation: validateMeasuredDraft(cell.value, cell.sibling.decimalPlaces),
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
        ? `Ada nilai yang tidak valid — gunakan angka (mis. ${dp0Hint}) atau simbol dari alat.`
        : null;

  const saveable = dirtyValidated.flatMap(({ sibling, tp, direction, index, existing, validation }) => {
    const payload = measuredReadingPayload(validation);
    if (!payload) return [];
    return [{ sibling, tp, direction, index, existing, payload }];
  });
  const newItems: MeasurementBatchItem[] = saveable
    .filter(({ existing }) => !existing)
    .map(({ sibling, tp, direction, index, payload }) => ({
      deviceCalibrationParameterId: sibling.id,
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
      // Rows saved before the failing one stay saved (each write is independently
      // atomic, same as the per-parameter screens) — resync so their chips show.
      await onRefetch();
    } finally {
      setSaving(false);
    }
  }

  function renderCell(
    sibling: TechMeasurementParameter,
    tp: TechMeasurementTestPoint,
    direction: MeasurementDirection,
  ) {
    const group = groups.find(
      (g) => g.sibling.id === sibling.id && g.tp.id === tp.id && g.direction === direction,
    );
    if (!group) return null;
    const dp = sibling.decimalPlaces;
    return (
      <ul className="flex flex-col gap-2">
        {group.view.slots.map((slot) => {
          const key = cellKey(sibling.id, tp.id, direction, slot.replicateIndex);
          const existing = rowByKey.get(key);
          const value = draftFor(key, existing);
          const trimmed = value.trim();
          const validation =
            touched && trimmed !== "" ? validateMeasuredDraft(trimmed, dp) : { ok: true as const };
          const invalid = !validation.ok;
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <span className="min-w-16 shrink-0 whitespace-nowrap text-xs font-medium text-slate-500">
                {slot.slotLabel}
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
    );
  }

  return (
    <Screen
      title="NIBP"
      showBack
      footer={
        editable ? (
          <StickyActionBar>
            <p className="text-center text-xs text-slate-500">
              {filledPairCount}/{totalPairCount} titik terisi
            </p>
            {footerValidationMessage ? (
              <p className="text-center text-xs text-red-600">{footerValidationMessage}</p>
            ) : null}
            <Button
              fullWidth
              disabled={saving || nothingToSave || hasInvalid}
              onClick={() => void handleSave()}
            >
              {saving ? "Menyimpan…" : "Simpan Semua"}
            </Button>
          </StickyActionBar>
        ) : undefined
      }
    >
      <JobHeaderBlock job={job} />
      <div className="flex flex-col gap-4 p-4">
        {lockedReason ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {lockedReason}
          </div>
        ) : null}

        {submitError ? <ErrorBanner message={submitError} /> : null}

        <div className="flex flex-col gap-3">
          {sequences.map((sequence) => {
            const siblingsAtSequence = siblingsWithPoints.filter(({ testPoints }) =>
              testPoints.some((p) => p.sequence === sequence),
            );
            // All siblings share the same direction set in practice (one
            // simulator reading yields Systole+Mean+Diastole together); take
            // the first present sibling's directions for the block.
            const blockDirections = siblingsAtSequence[0]?.directions ?? (["NONE"] as MeasurementDirection[]);
            const canAddBlock =
              editable &&
              siblingsAtSequence.length > 0 &&
              siblingsAtSequence.every(({ sibling }) => canAddReplicateSlot(editable, sibling));
            return (
              <div key={sequence} className="rounded-xl border border-slate-300 bg-slate-50 p-3">
                <p className="sticky top-0 z-10 -mx-3 -mt-3 mb-2 border-b border-slate-200 bg-slate-50 px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Titik {sequence}
                </p>
                {blockDirections.map((direction) => {
                  const directionLabel =
                    direction === "UP" ? "Naik" : direction === "DOWN" ? "Turun" : null;
                  const blockKey = blockExtraKey(sequence, direction);
                  return (
                    <div key={direction} className="flex flex-col gap-2">
                      {directionLabel ? (
                        <span className="text-[11px] text-slate-500">{directionLabel}</span>
                      ) : null}
                      {siblingsWithPoints.map(({ sibling, testPoints }) => {
                        const tp = testPoints.find((p) => p.sequence === sequence);
                        return (
                          <div
                            key={sibling.id}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800">
                                {sibling.name}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {toleranceText(sibling)}
                              </span>
                            </div>
                            {!tp ? (
                              <p className="mt-2 text-xs text-slate-400">
                                Belum ada titik ukur pada urutan ini.
                              </p>
                            ) : (
                              <>
                                {tp.settingValue ? (
                                  <p className="mt-0.5 text-xs text-slate-500">{tp.settingValue}</p>
                                ) : null}
                                <div className="mt-2">{renderCell(sibling, tp, direction)}</div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {canAddBlock ? (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setExtraByBlock((prev) => ({
                              ...prev,
                              [blockKey]: (prev[blockKey] ?? 0) + 1,
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
      </div>
    </Screen>
  );
}
