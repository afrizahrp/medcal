"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ToleranceBoundOperatorSelect, selectClassName } from "./device-calibration-parameters-ui";
import type {
  DeviceCapabilityItemRow,
  DeviceCapabilityRow,
} from "../device-capabilities/device-capabilities-ui";
import type { DeviceTypeRow } from "../device-types/device-types-ui";
import type { UomRow } from "../uoms/uoms-ui";

const fieldClass =
  "mt-1 w-full placeholder:text-xs placeholder:font-normal placeholder:text-slate-400/70";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceCalibrationParameterFormValue {
  deviceTypeId: string;
  capabilityId: string;
  capabilityItemId: string;
  code: string;
  name: string;
  uomId: string;
  toleranceMin: string;
  toleranceMax: string;
  /** true = ≥, false = >. Ignored when toleranceMin is empty. */
  toleranceMinInclusive: boolean;
  /** true = ≤, false = <. Ignored when toleranceMax is empty. */
  toleranceMaxInclusive: boolean;
  toleranceNote: string;
  decimalPlaces: string;
  /**
   * Phase 4A (Gap A) — catalog grouping for a logical test that yields several
   * independently measured quantities (Dental X-Ray kV + s + mGy). Empty = a
   * standalone parameter, which is how every existing parameter behaves.
   */
  logicalTestKey: string;
  logicalTestSequence: string;
  /**
   * Phase 4B (Gap B) — "DIRECT_REPLICATES" (default) or "DERIVED". DERIVED
   * means the technician computes and types in the value by hand (e.g. an
   * Autoclave ΔT); Medcal never calculates it. `derivation` is a free-text note
   * on what it's derived from — documentation only, ignored unless entryStyle
   * is DERIVED.
   */
  entryStyle: "DIRECT_REPLICATES" | "DERIVED";
  derivation: string;
  /**
   * Tech-PWA repetition UX (2026-09-20). Whether "+ Tambah ulangan" is offered
   * for this parameter's applicable points. true (default) preserves today's
   * behavior for every parameter.
   */
  allowsRepeatedReadings: boolean;
  description: string;
}

export interface DeviceCalibrationParameterFormFieldsProps {
  value: DeviceCalibrationParameterFormValue;
  onChange: <K extends keyof DeviceCalibrationParameterFormValue>(
    field: K,
    value: DeviceCalibrationParameterFormValue[K],
  ) => void;
  capabilities: DeviceCapabilityRow[];
  capabilitiesLoading?: boolean;
  capabilityItems: DeviceCapabilityItemRow[];
  capabilityItemsLoading?: boolean;
  deviceTypes: DeviceTypeRow[];
  deviceTypesLoading?: boolean;
  uoms: UomRow[];
  uomsLoading?: boolean;
  /**
   * "create" (default) exposes the Device Type / Capability / Capability Item pickers.
   * "edit" locks the structural hierarchy: it renders a read-only breadcrumb instead,
   * so users can only edit the parameter's own attributes.
   */
  mode?: "create" | "edit";
  /** Parameter value type — decimalPlaces is only shown for NUMBER. Defaults to NUMBER. */
  valueType?: "NUMBER" | "RATIO" | "TEXT" | "BOOLEAN";
  /**
   * Phase 4B (Gap B). Set when editing a row whose CURRENT entryStyle is
   * LOGGER_SUMMARY — a shape the Portal cannot create or safely reassign (it
   * has CalibrationTestPoint children with no create endpoint yet, same as the
   * `copy()` skip). The Entry Style control renders read-only, and the caller
   * must leave `entryStyle`/`derivation` out of the update payload so an
   * unrelated edit (e.g. tolerance) can never silently downgrade it.
   */
  entryStyleLocked?: boolean;
}

function ComboboxField({
  id,
  label,
  required,
  open,
  onOpenChange,
  disabled,
  selectedLabel,
  placeholder,
  loadingLabel,
  searchPlaceholder,
  emptyLabel,
  items,
  selectedId,
  onSelect,
}: {
  id: string;
  label: string;
  required?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  selectedLabel?: string;
  placeholder: string;
  loadingLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  items: Array<{ id: string; label: string; searchValue: string; hint?: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <CommandPopover
        open={open}
        onOpenChange={onOpenChange}
        searchPlaceholder={searchPlaceholder}
        emptyLabel={disabled ? loadingLabel : emptyLabel}
        trigger={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            disabled={disabled}
            className={cn(fieldClass, "justify-between font-normal")}
          >
            {selectedLabel ? (
              <span className="truncate">{selectedLabel}</span>
            ) : (
              <span className="text-slate-400">{disabled ? loadingLabel : placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      >
        <CommandGroup>
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={item.searchValue}
              onSelect={() => {
                onSelect(item.id);
                onOpenChange(false);
              }}
            >
              <Check
                className={cn("mr-2 h-4 w-4", selectedId === item.id ? "opacity-100" : "opacity-0")}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.label}</p>
                {item.hint ? (
                  <p className="truncate font-mono text-xs text-slate-500">{item.hint}</p>
                ) : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandPopover>
    </div>
  );
}

export function DeviceCalibrationParameterFormFields({
  value,
  onChange,
  capabilities,
  capabilitiesLoading,
  capabilityItems,
  capabilityItemsLoading,
  deviceTypes,
  deviceTypesLoading,
  uoms,
  uomsLoading,
  mode = "create",
  valueType = "NUMBER",
  entryStyleLocked = false,
}: DeviceCalibrationParameterFormFieldsProps) {
  const [deviceTypeOpen, setDeviceTypeOpen] = useState(false);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [uomOpen, setUomOpen] = useState(false);

  const selectedDeviceType = deviceTypes.find((t) => t.id === value.deviceTypeId);
  const selectedCapability = capabilities.find((c) => c.id === value.capabilityId);
  const selectedItem = capabilityItems.find((item) => item.id === value.capabilityItemId);
  const selectedUom = uoms.find((uom) => uom.id === value.uomId);
  const showDecimalPlaces = valueType === "NUMBER";

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Calibration Parameter</h2>

        {mode === "edit" ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Konteks (tidak dapat diubah)
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {selectedDeviceType?.name ?? "—"}
              <span className="mx-1.5 text-slate-400">›</span>
              {selectedCapability?.name ?? "—"}
              <span className="mx-1.5 text-slate-400">›</span>
              {selectedItem?.name ?? "—"}
            </p>
          </div>
        ) : (
          <>
            <div className={gridClass}>
              <ComboboxField
                id="deviceTypeId"
                label="Device Name"
                required
                open={deviceTypeOpen}
                onOpenChange={setDeviceTypeOpen}
                disabled={deviceTypesLoading}
                selectedLabel={selectedDeviceType?.name}
                placeholder="Pilih device name"
                loadingLabel="Memuat…"
                searchPlaceholder="Cari device name…"
                emptyLabel="Device Name tidak ditemukan."
                items={deviceTypes.map((deviceType) => ({
                  id: deviceType.id,
                  label: deviceType.name,
                  searchValue: `${deviceType.name} ${deviceType.code}`,
                  hint: deviceType.code,
                }))}
                selectedId={value.deviceTypeId}
                onSelect={(id) => onChange("deviceTypeId", id)}
              />
            </div>

            <div className={gridClass}>
              <ComboboxField
                id="capabilityId"
                label="Capability"
                open={capabilityOpen}
                onOpenChange={setCapabilityOpen}
                disabled={capabilitiesLoading}
                selectedLabel={selectedCapability?.name}
                placeholder="Pilih capability"
                loadingLabel="Memuat capability…"
                searchPlaceholder="Cari capability…"
                emptyLabel="Capability tidak ditemukan."
                items={capabilities.map((capability) => ({
                  id: capability.id,
                  label: capability.name,
                  searchValue: `${capability.name} ${capability.code}`,
                  hint: capability.code,
                }))}
                selectedId={value.capabilityId}
                onSelect={(id) => {
                  onChange("capabilityId", id);
                  onChange("capabilityItemId", "");
                }}
              />

              <ComboboxField
                id="capabilityItemId"
                label="Capability Item"
                required
                open={itemOpen}
                onOpenChange={setItemOpen}
                disabled={!value.capabilityId || capabilityItemsLoading}
                selectedLabel={selectedItem?.name}
                placeholder={value.capabilityId ? "Pilih capability item" : "Pilih capability dulu"}
                loadingLabel="Memuat item…"
                searchPlaceholder="Cari capability item…"
                emptyLabel="Capability Item tidak ditemukan."
                items={capabilityItems.map((item) => ({
                  id: item.id,
                  label: item.name,
                  searchValue: item.name,
                }))}
                selectedId={value.capabilityItemId}
                onSelect={(id) => onChange("capabilityItemId", id)}
              />
            </div>
          </>
        )}

        <div className={gridClass}>
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-slate-700">
              Kode
            </label>
            <Input
              id="code"
              value={mode === "edit" ? value.code : "Otomatis"}
              readOnly
              disabled
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              {mode === "edit"
                ? "Kode otomatis — tidak dapat diubah."
                : "Kode dibuat otomatis oleh sistem saat disimpan."}
            </p>
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Nama <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              value={value.name}
              onChange={(e) => onChange("name", e.target.value)}
              className={fieldClass}
              placeholder="Reference Value"
              maxLength={150}
              required
            />
          </div>
        </div>

        <ComboboxField
          id="uomId"
          label="UOM parameter"
          required
          open={uomOpen}
          onOpenChange={setUomOpen}
          disabled={uomsLoading}
          selectedLabel={selectedUom ? `${selectedUom.symbol} — ${selectedUom.name}` : undefined}
          placeholder="Pilih UOM"
          loadingLabel="Memuat UOM…"
          searchPlaceholder="Cari UOM…"
          emptyLabel="UOM tidak ditemukan."
          items={uoms.map((uom) => ({
            id: uom.id,
            label: `${uom.symbol} — ${uom.name}`,
            searchValue: `${uom.symbol} ${uom.name} ${uom.code}`,
            hint: uom.code,
          }))}
          selectedId={value.uomId}
          onSelect={(id) => onChange("uomId", id)}
        />

        <div className={gridClass}>
          <div>
            <label htmlFor="toleranceMin" className="block text-sm font-medium text-slate-700">
              Toleransi min
            </label>
            <div className="mt-1 flex gap-2">
              <ToleranceBoundOperatorSelect
                id="toleranceMinInclusive"
                side="min"
                inclusive={value.toleranceMinInclusive}
                disabled={value.toleranceMin.trim() === ""}
                onChange={(inclusive) => onChange("toleranceMinInclusive", inclusive)}
              />
              <Input
                id="toleranceMin"
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
            <label htmlFor="toleranceMax" className="block text-sm font-medium text-slate-700">
              Toleransi max
            </label>
            <div className="mt-1 flex gap-2">
              <ToleranceBoundOperatorSelect
                id="toleranceMaxInclusive"
                side="max"
                inclusive={value.toleranceMaxInclusive}
                disabled={value.toleranceMax.trim() === ""}
                onChange={(inclusive) => onChange("toleranceMaxInclusive", inclusive)}
              />
              <Input
                id="toleranceMax"
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
          Isi keduanya untuk rentang (25 ± 6°C → 19–31). Hanya max untuk batas atas. Default
          termasuk batas (≥ / ≤). Pilih &quot;tidak termasuk&quot; untuk &gt; atau &lt;, misalnya
          &gt; 2 MΩ.
        </p>
        <div>
          <label htmlFor="toleranceNote" className="block text-sm font-medium text-slate-700">
            Catatan toleransi (teks LK)
          </label>
          <Input
            id="toleranceNote"
            value={value.toleranceNote}
            onChange={(e) => onChange("toleranceNote", e.target.value)}
            className={fieldClass}
            placeholder="25 ± 6°C"
            maxLength={500}
          />
        </div>

        {showDecimalPlaces ? (
          <div className={gridClass}>
            <div>
              <label htmlFor="decimalPlaces" className="block text-sm font-medium text-slate-700">
                Decimal Places
              </label>
              <Input
                id="decimalPlaces"
                type="number"
                min={0}
                max={10}
                step={1}
                value={value.decimalPlaces}
                onChange={(e) => onChange("decimalPlaces", e.target.value)}
                className={fieldClass}
                placeholder="0–10"
              />
              <p className="mt-1 text-xs text-slate-500">
                Jumlah digit di belakang koma untuk hasil pengukuran parameter ini (0–10).
              </p>
            </div>
          </div>
        ) : null}

        <div className={gridClass}>
          <div>
            <label htmlFor="logicalTestKey" className="block text-sm font-medium text-slate-700">
              Kunci uji gabungan
            </label>
            <Input
              id="logicalTestKey"
              value={value.logicalTestKey}
              onChange={(e) => onChange("logicalTestKey", e.target.value)}
              className={fieldClass}
              placeholder="mis. DXRAY_REPRODUCIBILITY"
              maxLength={100}
            />
            <p className="mt-1 text-xs text-slate-500">
              Isi hanya jika parameter ini salah satu besaran dari satu uji yang sama (mis. kV, s,
              dan mGy dari satu eksposur). Parameter dengan kunci sama dicetak berurutan di LK.
              Kosongkan untuk parameter berdiri sendiri.
            </p>
          </div>
          <div>
            <label
              htmlFor="logicalTestSequence"
              className="block text-sm font-medium text-slate-700"
            >
              Urutan dalam uji gabungan
            </label>
            <Input
              id="logicalTestSequence"
              type="number"
              min={1}
              max={100}
              step={1}
              value={value.logicalTestSequence}
              onChange={(e) => onChange("logicalTestSequence", e.target.value)}
              className={fieldClass}
              placeholder="1–100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Wajib diisi bersama kunci di samping. Menentukan urutan kolom pada baris LK.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="entryStyle" className="block text-sm font-medium text-slate-700">
            Cara pengisian
          </label>
          {entryStyleLocked ? (
            <p
              className={`${fieldClass} rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600`}
            >
              Logger summary (grid dengan lampiran) — tidak dapat diubah dari sini.
            </p>
          ) : (
            <select
              id="entryStyle"
              value={value.entryStyle}
              onChange={(e) =>
                onChange(
                  "entryStyle",
                  e.target.value as DeviceCalibrationParameterFormValue["entryStyle"],
                )
              }
              className={`${selectClassName} ${fieldClass}`}
            >
              <option value="DIRECT_REPLICATES">Terukur langsung (default)</option>
              <option value="DERIVED">Nilai turunan (dihitung manual oleh teknisi)</option>
            </select>
          )}
          <p className="mt-1 text-xs text-slate-500">
            &quot;Nilai turunan&quot; berarti teknisi menghitung dan mengetik hasilnya sendiri (mis.
            selisih ΔT pada Autoclave). Medcal tidak pernah menghitung nilai ini secara otomatis.
          </p>
        </div>

        <div>
          <label
            htmlFor="allowsRepeatedReadings"
            className="block text-sm font-medium text-slate-700"
          >
            Ulangan
          </label>
          <select
            id="allowsRepeatedReadings"
            value={value.allowsRepeatedReadings ? "true" : "false"}
            onChange={(e) => onChange("allowsRepeatedReadings", e.target.value === "true")}
            className={`${selectClassName} ${fieldClass}`}
          >
            <option value="true">Boleh diulang (default)</option>
            <option value="false">Satu kali saja</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            &quot;Satu kali saja&quot; menyembunyikan tombol &quot;+ Tambah ulangan&quot; di
            Tech-PWA untuk titik ukur parameter ini (mis. Suhu Ruangan → Awal/Akhir). Bacaan yang
            sudah tersimpan tetap tampil apa pun pilihannya.
          </p>
        </div>

        {!entryStyleLocked && value.entryStyle === "DERIVED" ? (
          <div>
            <label htmlFor="derivation" className="block text-sm font-medium text-slate-700">
              Diturunkan dari (catatan)
            </label>
            <Input
              id="derivation"
              value={value.derivation}
              onChange={(e) => onChange("derivation", e.target.value)}
              className={fieldClass}
              placeholder="mis. Selisih antara S1 dan S3"
              maxLength={1000}
            />
            <p className="mt-1 text-xs text-slate-500">
              Catatan dokumentasi saja — bukan rumus, dan tidak dihitung oleh sistem. Kosongkan jika
              tidak perlu dijelaskan.
            </p>
          </div>
        ) : null}

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-700">
            Deskripsi
          </label>
          <textarea
            id="description"
            value={value.description}
            onChange={(e) => onChange("description", e.target.value)}
            className={`${selectClassName} ${fieldClass} min-h-[72px]`}
            maxLength={500}
          />
        </div>
      </section>
    </div>
  );
}

export function validateCalibrationToleranceForm(
  form: DeviceCalibrationParameterFormValue,
): string | null {
  const minRaw = form.toleranceMin.trim();
  const maxRaw = form.toleranceMax.trim();
  const min = minRaw === "" ? null : Number(minRaw);
  const max = maxRaw === "" ? null : Number(maxRaw);
  if (minRaw !== "" && !Number.isFinite(min)) return "Toleransi min tidak valid.";
  if (maxRaw !== "" && !Number.isFinite(max)) return "Toleransi max tidak valid.";
  if (min != null && max != null && min > max) {
    return "Toleransi min tidak boleh lebih besar dari max.";
  }
  const dpRaw = form.decimalPlaces.trim();
  if (dpRaw !== "") {
    const dp = Number(dpRaw);
    if (!Number.isInteger(dp) || dp < 0 || dp > 10) {
      return "Decimal places harus bilangan bulat 0–10.";
    }
  }
  const keyRaw = form.logicalTestKey.trim();
  const seqRaw = form.logicalTestSequence.trim();
  if (keyRaw !== "" && seqRaw === "") {
    return "Urutan dalam uji gabungan wajib diisi jika kunci uji gabungan diisi.";
  }
  if (seqRaw !== "" && keyRaw === "") {
    return "Kunci uji gabungan wajib diisi jika urutan diisi.";
  }
  if (seqRaw !== "") {
    const seq = Number(seqRaw);
    if (!Number.isInteger(seq) || seq < 1 || seq > 100) {
      return "Urutan dalam uji gabungan harus bilangan bulat 1–100.";
    }
  }
  if (form.entryStyle !== "DERIVED" && form.derivation.trim() !== "") {
    return 'Catatan "diturunkan dari" hanya berlaku untuk cara pengisian "Nilai turunan".';
  }
  return null;
}

export function buildDeviceCalibrationParameterCreatePayload(
  form: DeviceCalibrationParameterFormValue,
) {
  const description = form.description.trim();
  const note = form.toleranceNote.trim();
  const minRaw = form.toleranceMin.trim();
  const maxRaw = form.toleranceMax.trim();
  const dpRaw = form.decimalPlaces.trim();
  const keyRaw = form.logicalTestKey.trim();
  const seqRaw = form.logicalTestSequence.trim();
  const derivationRaw = form.derivation.trim();
  return {
    deviceTypeId: form.deviceTypeId,
    capabilityItemId: form.capabilityItemId,
    name: form.name.trim(),
    uomId: form.uomId,
    ...(description ? { description } : {}),
    ...(minRaw !== ""
      ? { toleranceMin: Number(minRaw), toleranceMinInclusive: form.toleranceMinInclusive }
      : {}),
    ...(maxRaw !== ""
      ? { toleranceMax: Number(maxRaw), toleranceMaxInclusive: form.toleranceMaxInclusive }
      : {}),
    ...(note ? { toleranceNote: note } : {}),
    ...(dpRaw !== "" ? { decimalPlaces: Number(dpRaw) } : {}),
    ...(keyRaw !== "" ? { logicalTestKey: keyRaw } : {}),
    ...(seqRaw !== "" ? { logicalTestSequence: Number(seqRaw) } : {}),
    entryStyle: form.entryStyle,
    ...(form.entryStyle === "DERIVED" && derivationRaw !== ""
      ? { derivation: { description: derivationRaw } }
      : {}),
    allowsRepeatedReadings: form.allowsRepeatedReadings,
  };
}

export function buildDeviceCalibrationParameterUpdatePayload(
  form: DeviceCalibrationParameterFormValue & { isActive?: boolean },
  /**
   * Phase 4B (Gap B). Pass `true` when the row being edited is currently
   * LOGGER_SUMMARY — `entryStyle`/`derivation` are then left out of the
   * payload entirely, so an unrelated edit (tolerance, description, …) can
   * never silently downgrade it to DIRECT_REPLICATES. See
   * `DeviceCalibrationParameterFormFieldsProps.entryStyleLocked`.
   */
  entryStyleLocked = false,
) {
  const minRaw = form.toleranceMin.trim();
  const maxRaw = form.toleranceMax.trim();
  const dpRaw = form.decimalPlaces.trim();
  const keyRaw = form.logicalTestKey.trim();
  const seqRaw = form.logicalTestSequence.trim();
  const derivationRaw = form.derivation.trim();
  return {
    deviceTypeId: form.deviceTypeId,
    capabilityItemId: form.capabilityItemId,
    name: form.name.trim(),
    ...(form.uomId ? { uomId: form.uomId } : {}),
    description: form.description.trim() ? form.description.trim() : null,
    toleranceMin: minRaw === "" ? null : Number(minRaw),
    toleranceMax: maxRaw === "" ? null : Number(maxRaw),
    toleranceMinInclusive: minRaw === "" ? true : form.toleranceMinInclusive,
    toleranceMaxInclusive: maxRaw === "" ? true : form.toleranceMaxInclusive,
    toleranceNote: form.toleranceNote.trim() ? form.toleranceNote.trim() : null,
    decimalPlaces: dpRaw === "" ? null : Number(dpRaw),
    logicalTestKey: keyRaw === "" ? null : keyRaw,
    logicalTestSequence: seqRaw === "" ? null : Number(seqRaw),
    ...(entryStyleLocked
      ? {}
      : {
          entryStyle: form.entryStyle,
          derivation:
            form.entryStyle === "DERIVED" && derivationRaw !== ""
              ? { description: derivationRaw }
              : null,
        }),
    allowsRepeatedReadings: form.allowsRepeatedReadings,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatDeviceCalibrationParameterApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_CALIBRATION_PARAMETER_CODE") {
      return "Calibration Parameter dengan kode ini sudah ada pada Device Name dan Capability Item yang sama.";
    }
    if (code === "DUPLICATE_LOGICAL_TEST_SEQUENCE") {
      return "Urutan ini sudah dipakai parameter lain pada uji gabungan yang sama.";
    }
    if (code === "INVALID_LOGICAL_TEST_GROUPING") {
      return "Kunci uji gabungan dan urutannya harus diisi bersama-sama.";
    }
    if (code === "INVALID_DERIVATION_FOR_ENTRY_STYLE") {
      return 'Catatan "diturunkan dari" hanya berlaku untuk cara pengisian "Nilai turunan".';
    }
    if (code === "DEVICE_CALIBRATION_PARAMETER_NOT_FOUND") {
      return "Calibration Parameter tidak ditemukan.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") {
      return "Device Name yang dipilih tidak ditemukan.";
    }
    if (code === "DEVICE_CAPABILITY_ITEM_NOT_FOUND") {
      return "Capability Item yang dipilih tidak ditemukan.";
    }
    if (code === "UOM_NOT_FOUND") {
      return "UOM yang dipilih tidak ditemukan.";
    }
    if (code === "INVALID_CALIBRATION_TOLERANCE") {
      return "Rentang toleransi tidak valid. Min tidak boleh lebih besar dari max.";
    }
    if (code === "INVALID_DECIMAL_PLACES_FOR_VALUE_TYPE") {
      return "Decimal places hanya berlaku untuk parameter bertipe NUMBER.";
    }
    if (
      code === "INVALID_DEVICE_CALIBRATION_PARAMETER" ||
      code === "INVALID_DEVICE_CALIBRATION_PARAMETER_UPDATE"
    ) {
      return "Data Calibration Parameter tidak valid. Periksa kembali isian form.";
    }
    if (code === "INVALID_DEVICE_CALIBRATION_PARAMETER_COPY") {
      return "Data copy tidak valid. Periksa kembali Device Name sumber/tujuan dan parameter yang dipilih.";
    }
    if (code === "DEVICE_CALIBRATION_PARAMETER_COPY_INVALID_SOURCE") {
      return "Beberapa parameter yang dipilih sudah tidak ada di Device Name sumber. Muat ulang halaman dan coba lagi.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Calibration Parameter. Silakan coba lagi.";
}
