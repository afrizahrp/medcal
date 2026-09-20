"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthz } from "@medcal/auth/client";
import { Screen } from "../../../../../components/layout/screen";
import { StickyActionBar } from "../../../../../components/layout/sticky-action-bar";
import { Button } from "../../../../../components/ui/button";
import { ErrorBanner } from "../../../../../components/feedback/error-banner";
import { LoadingState, ErrorState } from "../../../../../components/ui/state-views";
import { formatApiError } from "../../../../../lib/api-errors";
import {
  canRecordMeasurement,
  formatReadingDisplay,
  measuredValueDecimalPlacesExceededMessage,
  measuredValueInputStep,
  canAddReplicateSlot,
  measurementLockedReason,
  readingDisplayValue,
  toleranceText,
  validateMeasuredDraft,
  visibleReplicateCount,
  measuredReadingPayload,
  replicateLabel,
  resolveMeasurementEntryTarget,
  type MeasurementBatchItem,
  type TechMeasurementResult,
} from "../../../../../lib/calibration/measurement";
import { useJobQuery } from "../../use-job-query";
import { JobHeaderBlock } from "../../job-detail-ui";
import {
  useCreateMeasurementBatch,
  useMeasurementParameters,
  useMeasurementResults,
  useUpdateMeasurement,
} from "../use-measurements-query";
import { PassFailChip } from "../measurements-ui";
import { MeasurementGridEntry } from "../measurement-grid";

function GuardScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen title="Pengukuran Parameter" showBack>
      {children}
    </Screen>
  );
}

export default function MeasurementParameterEntryPage() {
  const params = useParams<{ id: string; parameterId: string }>();
  const { id, parameterId } = params;
  const router = useRouter();
  const { capabilities } = useAuthz();

  const jobQuery = useJobQuery(id, { poll: true });
  const parametersQuery = useMeasurementParameters(id);
  const resultsQuery = useMeasurementResults(id);
  const batchMutation = useCreateMeasurementBatch(id);
  const updateMutation = useUpdateMeasurement(id);

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [extraRows, setExtraRows] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const canRecord = Boolean(capabilities?.calibrationJobRecordMeasurement);
  const attempt = jobQuery.data?.currentAttempt ?? 1;

  const existingRows = useMemo(() => {
    const rows = (resultsQuery.data ?? []).filter(
      (r) =>
        r.deviceCalibrationParameterId === parameterId &&
        r.calibrationTestPointId === null &&
        r.attemptNumber === attempt,
    );
    return rows.sort((a, b) => a.replicateIndex - b.replicateIndex);
  }, [resultsQuery.data, parameterId, attempt]);

  const gridExistingRows = useMemo(() => {
    const rows = (resultsQuery.data ?? []).filter(
      (r) =>
        r.deviceCalibrationParameterId === parameterId &&
        r.calibrationTestPointId !== null &&
        r.attemptNumber === attempt,
    );
    return rows.sort((a, b) => a.replicateIndex - b.replicateIndex);
  }, [resultsQuery.data, parameterId, attempt]);

  const entryTarget = resolveMeasurementEntryTarget(parametersQuery.data, parameterId);
  const param = entryTarget?.param ?? null;

  const rowByIndex = useMemo(() => {
    const map = new Map<number, TechMeasurementResult>();
    for (const r of existingRows) map.set(r.replicateIndex, r);
    return map;
  }, [existingRows]);

  if (jobQuery.isPending || parametersQuery.isPending || resultsQuery.isPending) {
    return (
      <GuardScreen>
        <LoadingState />
      </GuardScreen>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(jobQuery.error, "Gagal memuat job.")}
          onRetry={() => void jobQuery.refetch()}
        />
      </GuardScreen>
    );
  }
  if (parametersQuery.isError) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(parametersQuery.error, "Gagal memuat parameter.")}
          onRetry={() => void parametersQuery.refetch()}
        />
      </GuardScreen>
    );
  }
  if (resultsQuery.isError) {
    return (
      <GuardScreen>
        <ErrorState
          message={formatApiError(resultsQuery.error, "Gagal memuat hasil pengukuran.")}
          onRetry={() => void resultsQuery.refetch()}
        />
      </GuardScreen>
    );
  }

  const job = jobQuery.data;

  if (!canRecord || !param) {
    return (
      <GuardScreen>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            {param ? "Aksi tidak tersedia." : "Parameter tidak ditemukan pada job ini."}
          </p>
          <Button variant="secondary" onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
      </GuardScreen>
    );
  }

  const editable = canRecordMeasurement(job);
  const lockedReason = measurementLockedReason(job);

  if (entryTarget?.kind === "GRID") {
    return (
      <MeasurementGridEntry
        job={job}
        parameterId={parameterId}
        param={entryTarget.param}
        existingRows={gridExistingRows}
        editable={editable}
        lockedReason={lockedReason}
        onBatchCreate={(items) => batchMutation.mutateAsync(items)}
        onUpdate={(args) => updateMutation.mutateAsync(args)}
        onRefetch={() => resultsQuery.refetch()}
      />
    );
  }

  const dp = param.decimalPlaces;
  const exampleHint = dp == null ? "12.3" : dp === 0 ? "120" : (12.3).toFixed(dp);

  const maxExistingIndex = existingRows.reduce((m, r) => Math.max(m, r.replicateIndex), 0);
  const rowCount = visibleReplicateCount(maxExistingIndex, extraRows);
  const indices = Array.from({ length: rowCount }, (_, i) => i + 1);

  const draftFor = (index: number): string => {
    if (index in drafts) return drafts[index]!;
    return readingDisplayValue(rowByIndex.get(index));
  };
  const setDraft = (index: number, value: string) => {
    setTouched(true);
    setSubmitError(null);
    setDrafts((prev) => ({ ...prev, [index]: value }));
  };

  const dirtyValues = indices
    .map((index) => ({ index, value: draftFor(index).trim(), existing: rowByIndex.get(index) }))
    .filter(({ index, value, existing }) => {
      if (!(index in drafts)) return false;
      const stored = readingDisplayValue(existing).trim();
      return value !== stored;
    });

  const dirtyValidated = dirtyValues
    .filter(({ value }) => value !== "")
    .map(({ index, value, existing }) => ({
      index,
      value,
      existing,
      validation: validateMeasuredDraft(value, dp),
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

  const saveable = dirtyValidated.flatMap(({ index, existing, validation }) => {
    const payload = measuredReadingPayload(validation);
    if (!payload) return [];
    return [{ index, existing, payload }];
  });
  const newItems: MeasurementBatchItem[] = saveable
    .filter(({ existing }) => !existing)
    .map(({ index, payload }) => ({
      deviceCalibrationParameterId: parameterId,
      replicateIndex: index,
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
  const saving = batchMutation.isPending || updateMutation.isPending;

  async function handleSave() {
    setSubmitError(null);
    try {
      if (newItems.length > 0) await batchMutation.mutateAsync(newItems);
      for (const u of updates) await updateMutation.mutateAsync(u);
      await resultsQuery.refetch();
      setDrafts({});
      setTouched(false);
    } catch (err) {
      setSubmitError(formatApiError(err, "Gagal menyimpan pembacaan."));
      // A row may have been saved before the failure — resync so its chip shows.
      // Drafts are kept: any row whose value now matches the server simply stops
      // counting as dirty on the next save.
      await resultsQuery.refetch();
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
            <Button fullWidth disabled={saving || nothingToSave || hasInvalid} onClick={handleSave}>
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
            Satuan: {param.uom?.symbol ?? "—"} · Desimal: {dp == null ? "—" : dp}
          </p>
        </div>

        {lockedReason ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {lockedReason}
          </div>
        ) : null}

        {submitError ? <ErrorBanner message={submitError} /> : null}

        <ul className="flex flex-col gap-2">
          {indices.map((index) => {
            const existing = rowByIndex.get(index);
            const value = draftFor(index);
            const trimmed = value.trim();
            const validation =
              touched && trimmed !== "" ? validateMeasuredDraft(trimmed, dp) : { ok: true as const };
            const invalid = !validation.ok;
            return (
              <li
                key={index}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <span className="w-16 shrink-0 text-xs font-medium text-slate-500">
                  {replicateLabel(index)}
                </span>
                {editable ? (
                  <input
                    inputMode="decimal"
                    step={measuredValueInputStep(dp)}
                    type="text"
                    value={value}
                    onChange={(e) => setDraft(index, e.target.value)}
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

        {canAddReplicateSlot(editable, param) ? (
          <Button variant="ghost" onClick={() => setExtraRows((n) => n + 1)}>
            + Tambah ulangan
          </Button>
        ) : null}

        {param.allowsRepeatedReadings ? (
          <p className="text-xs text-slate-400">
            Tambah ulangan bila alat ini butuh lebih dari satu pembacaan.
          </p>
        ) : null}
      </div>
    </Screen>
  );
}
