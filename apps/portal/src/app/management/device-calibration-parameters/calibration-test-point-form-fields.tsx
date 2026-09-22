"use client";

import { Input } from "@/components/ui/input";
import { ToleranceBoundOperatorSelect, selectClassName } from "./device-calibration-parameters-ui";
import type { CalibrationTestPointFormValue } from "./calibration-test-point-form-utils";

// Pure form-state logic (payload builders, validation, error formatting) lives
// in calibration-test-point-form-utils.ts — plain .ts, no JSX — so it can be
// unit-tested directly. Re-exported here so existing import sites (this file)
// keep working unchanged.
export {
  emptyCalibrationTestPointForm,
  calibrationTestPointFormFromRow,
  validateCalibrationTestPointForm,
  buildCalibrationTestPointCreatePayload,
  buildCalibrationTestPointUpdatePayload,
  formatCalibrationTestPointApiError,
  type CalibrationTestPointFormValue,
} from "./calibration-test-point-form-utils";

const fieldClass =
  "mt-1 w-full placeholder:text-xs placeholder:font-normal placeholder:text-slate-400/70";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface CalibrationTestPointFormFieldsProps {
  value: CalibrationTestPointFormValue;
  onChange: <K extends keyof CalibrationTestPointFormValue>(
    field: K,
    value: CalibrationTestPointFormValue[K],
  ) => void;
  /** "create" (default) hides Status — a new point always starts active. */
  mode?: "create" | "edit";
  idPrefix?: string;
}

export function CalibrationTestPointFormFields({
  value,
  onChange,
  mode = "create",
  idPrefix = "test-point",
}: CalibrationTestPointFormFieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`${idPrefix}-settingLabel`}
          className="block text-sm font-medium text-slate-700"
        >
          Nama Titik <span className="text-red-500">*</span>
        </label>
        <Input
          id={`${idPrefix}-settingLabel`}
          value={value.settingLabel}
          onChange={(e) => onChange("settingLabel", e.target.value)}
          className={fieldClass}
          placeholder="Awal, Akhir, L-N, Posisi A, T1, …"
          maxLength={150}
          required
        />
        <p className="mt-1 text-xs text-slate-500">Unik dalam parameter ini.</p>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-settingValue`}
          className="block text-sm font-medium text-slate-700"
        >
          Setting
        </label>
        <Input
          id={`${idPrefix}-settingValue`}
          type="number"
          step="any"
          value={value.settingValue}
          onChange={(e) => onChange("settingValue", e.target.value)}
          className={fieldClass}
          placeholder="25"
        />
        <p className="mt-1 text-xs text-slate-500">
          Nilai nominal/setpoint. Kosongkan jika dipilih teknisi saat pengukuran.
        </p>
      </div>

      <div className={gridClass}>
        <div>
          <label
            htmlFor={`${idPrefix}-toleranceMin`}
            className="block text-sm font-medium text-slate-700"
          >
            Toleransi Minimum
          </label>
          <div className="mt-1 flex gap-2">
            <ToleranceBoundOperatorSelect
              id={`${idPrefix}-toleranceMinInclusive`}
              side="min"
              inclusive={value.toleranceMinInclusive}
              disabled={value.toleranceMin.trim() === ""}
              onChange={(inclusive) => onChange("toleranceMinInclusive", inclusive)}
            />
            <Input
              id={`${idPrefix}-toleranceMin`}
              type="number"
              step="any"
              value={value.toleranceMin}
              onChange={(e) => onChange("toleranceMin", e.target.value)}
              className="w-full placeholder:text-xs placeholder:font-normal placeholder:text-slate-400/70"
              placeholder="19"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}-toleranceMax`}
            className="block text-sm font-medium text-slate-700"
          >
            Toleransi Maksimum
          </label>
          <div className="mt-1 flex gap-2">
            <ToleranceBoundOperatorSelect
              id={`${idPrefix}-toleranceMaxInclusive`}
              side="max"
              inclusive={value.toleranceMaxInclusive}
              disabled={value.toleranceMax.trim() === ""}
              onChange={(inclusive) => onChange("toleranceMaxInclusive", inclusive)}
            />
            <Input
              id={`${idPrefix}-toleranceMax`}
              type="number"
              step="any"
              value={value.toleranceMax}
              onChange={(e) => onChange("toleranceMax", e.target.value)}
              className="w-full placeholder:text-xs placeholder:font-normal placeholder:text-slate-400/70"
              placeholder="31"
            />
          </div>
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Kosongkan untuk mewarisi toleransi parameter induk. Default termasuk batas
        (≥ / ≤). Pilih &quot;tidak termasuk&quot; untuk &gt; atau &lt;.
      </p>

      <div>
        <label
          htmlFor={`${idPrefix}-toleranceNote`}
          className="block text-sm font-medium text-slate-700"
        >
          Catatan Toleransi
        </label>
        <Input
          id={`${idPrefix}-toleranceNote`}
          value={value.toleranceNote}
          onChange={(e) => onChange("toleranceNote", e.target.value)}
          className={fieldClass}
          placeholder="25 ± 6°C"
          maxLength={500}
        />
      </div>

      {mode === "edit" ? (
        <div>
          <label htmlFor={`${idPrefix}-isActive`} className="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id={`${idPrefix}-isActive`}
            value={value.isActive ? "true" : "false"}
            onChange={(e) => onChange("isActive", e.target.value === "true")}
            className={`${selectClassName} ${fieldClass}`}
          >
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
