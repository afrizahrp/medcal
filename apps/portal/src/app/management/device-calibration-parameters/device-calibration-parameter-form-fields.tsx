"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { selectClassName } from "./device-calibration-parameters-ui";
import type { DeviceCapabilityItemRow, DeviceCapabilityRow } from "../device-capabilities/device-capabilities-ui";
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
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{disabled ? loadingLabel : emptyLabel}</CommandEmpty>
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
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedId === item.id ? "opacity-100" : "opacity-0",
                      )}
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
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
}: DeviceCalibrationParameterFormFieldsProps) {
  const [deviceTypeOpen, setDeviceTypeOpen] = useState(false);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [uomOpen, setUomOpen] = useState(false);

  const selectedDeviceType = deviceTypes.find((t) => t.id === value.deviceTypeId);
  const selectedCapability = capabilities.find((c) => c.id === value.capabilityId);
  const selectedItem = capabilityItems.find((item) => item.id === value.capabilityItemId);
  const selectedUom = uoms.find((uom) => uom.id === value.uomId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Calibration Parameter</h2>

        <div className={gridClass}>
          <ComboboxField
            id="deviceTypeId"
            label="Device Type"
            required
            open={deviceTypeOpen}
            onOpenChange={setDeviceTypeOpen}
            disabled={deviceTypesLoading}
            selectedLabel={selectedDeviceType?.name}
            placeholder="Pilih device type"
            loadingLabel="Memuat tipe…"
            searchPlaceholder="Cari device type…"
            emptyLabel="Device Type tidak ditemukan."
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
            />
            <p className="mt-1 text-xs text-slate-500">
              Unik dalam satu Device Type + Capability Item (huruf besar)
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
          label="UOM"
          required
          open={uomOpen}
          onOpenChange={setUomOpen}
          disabled={uomsLoading}
          selectedLabel={
            selectedUom ? `${selectedUom.symbol} — ${selectedUom.name}` : undefined
          }
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

export function buildDeviceCalibrationParameterCreatePayload(
  form: DeviceCalibrationParameterFormValue,
) {
  const description = form.description.trim();
  return {
    deviceTypeId: form.deviceTypeId,
    capabilityItemId: form.capabilityItemId,
    code: form.code.trim(),
    name: form.name.trim(),
    uomId: form.uomId,
    ...(description ? { description } : {}),
  };
}

export function buildDeviceCalibrationParameterUpdatePayload(
  form: DeviceCalibrationParameterFormValue,
) {
  return {
    deviceTypeId: form.deviceTypeId,
    capabilityItemId: form.capabilityItemId,
    code: form.code.trim(),
    name: form.name.trim(),
    uomId: form.uomId,
    description: form.description.trim() ? form.description.trim() : null,
  };
}

export function formatDeviceCalibrationParameterApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_CALIBRATION_PARAMETER_CODE") {
      return "Calibration Parameter dengan kode ini sudah ada pada Device Type dan Capability Item yang sama.";
    }
    if (code === "DEVICE_CALIBRATION_PARAMETER_NOT_FOUND") {
      return "Calibration Parameter tidak ditemukan.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") {
      return "Device Type yang dipilih tidak ditemukan.";
    }
    if (code === "DEVICE_CAPABILITY_ITEM_NOT_FOUND") {
      return "Capability Item yang dipilih tidak ditemukan.";
    }
    if (code === "UOM_NOT_FOUND") {
      return "UOM yang dipilih tidak ditemukan.";
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
