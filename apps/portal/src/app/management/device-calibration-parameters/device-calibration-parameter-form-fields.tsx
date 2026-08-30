"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { selectClassName } from "./device-calibration-parameters-ui";
import type {
  DeviceCapabilityItemRow,
  DeviceCapabilityRow,
} from "../device-capabilities/device-capabilities-ui";
import type { DeviceTypeRow } from "../device-types/device-types-ui";
import type { UomRow } from "../uoms/uoms-ui";

const fieldClass = "mt-1 w-full";
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
  toleranceNote: string;
  decimalPlaces: string;
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
                  searchValue: `${item.name} ${item.code}`,
                  hint: item.code,
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
              Kode <span className="text-red-500">*</span>
            </label>
            <Input
              id="code"
              value={value.code}
              onChange={(e) => onChange("code", e.target.value.toUpperCase())}
              className={fieldClass}
              placeholder="REFERENCE_VALUE"
              maxLength={64}
              required
              disabled={mode === "edit"}
            />
            <p className="mt-1 text-xs text-slate-500">
              {mode === "edit"
                ? "Kode tidak dapat diubah setelah dibuat"
                : "Unik dalam satu Device Name + Capability Item (huruf besar)"}
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
            <Input
              id="toleranceMin"
              type="number"
              step="any"
              value={value.toleranceMin}
              onChange={(e) => onChange("toleranceMin", e.target.value)}
              className={fieldClass}
              placeholder="19"
            />
          </div>
          <div>
            <label htmlFor="toleranceMax" className="block text-sm font-medium text-slate-700">
              Toleransi max
            </label>
            <Input
              id="toleranceMax"
              type="number"
              step="any"
              value={value.toleranceMax}
              onChange={(e) => onChange("toleranceMax", e.target.value)}
              className={fieldClass}
              placeholder="31"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          Isi keduanya untuk rentang (25 ± 6°C → 19–31). Hanya max untuk batas atas (≤500 µA).
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
  return {
    deviceTypeId: form.deviceTypeId,
    capabilityItemId: form.capabilityItemId,
    code: form.code.trim(),
    name: form.name.trim(),
    uomId: form.uomId,
    ...(description ? { description } : {}),
    ...(minRaw !== "" ? { toleranceMin: Number(minRaw) } : {}),
    ...(maxRaw !== "" ? { toleranceMax: Number(maxRaw) } : {}),
    ...(note ? { toleranceNote: note } : {}),
    ...(dpRaw !== "" ? { decimalPlaces: Number(dpRaw) } : {}),
  };
}

export function buildDeviceCalibrationParameterUpdatePayload(
  form: DeviceCalibrationParameterFormValue,
) {
  const minRaw = form.toleranceMin.trim();
  const maxRaw = form.toleranceMax.trim();
  const dpRaw = form.decimalPlaces.trim();
  return {
    deviceTypeId: form.deviceTypeId,
    capabilityItemId: form.capabilityItemId,
    code: form.code.trim(),
    name: form.name.trim(),
    ...(form.uomId ? { uomId: form.uomId } : {}),
    description: form.description.trim() ? form.description.trim() : null,
    toleranceMin: minRaw === "" ? null : Number(minRaw),
    toleranceMax: maxRaw === "" ? null : Number(maxRaw),
    toleranceNote: form.toleranceNote.trim() ? form.toleranceNote.trim() : null,
    decimalPlaces: dpRaw === "" ? null : Number(dpRaw),
  };
}

export function formatDeviceCalibrationParameterApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_CALIBRATION_PARAMETER_CODE") {
      return "Calibration Parameter dengan kode ini sudah ada pada Device Name dan Capability Item yang sama.";
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
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Calibration Parameter. Silakan coba lagi.";
}
