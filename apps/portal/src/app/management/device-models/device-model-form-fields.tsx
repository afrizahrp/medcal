"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { selectClassName } from "./device-models-ui";
import type { DeviceTypeRow } from "../device-types/device-types-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceModelFormValue {
  deviceTypeId: string;
  manufacturer: string;
  model: string;
  description: string;
}

export interface DeviceModelFormFieldsProps {
  value: DeviceModelFormValue;
  onChange: <K extends keyof DeviceModelFormValue>(
    field: K,
    value: DeviceModelFormValue[K],
  ) => void;
  deviceTypes: DeviceTypeRow[];
  deviceTypesLoading?: boolean;
}

export function DeviceModelFormFields({
  value,
  onChange,
  deviceTypes,
  deviceTypesLoading,
}: DeviceModelFormFieldsProps) {
  const [deviceTypeOpen, setDeviceTypeOpen] = useState(false);
  const selectedDeviceType = deviceTypes.find((t) => t.id === value.deviceTypeId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Device Model</h2>

        <div className={gridClass}>
          <div>
            <label htmlFor="deviceTypeId" className="block text-sm font-medium text-slate-700">
              Device Type <span className="text-red-500">*</span>
            </label>
            <CommandPopover
              open={deviceTypeOpen}
              onOpenChange={setDeviceTypeOpen}
              searchPlaceholder="Cari device type…"
              emptyLabel={deviceTypesLoading ? "Memuat…" : "Device Type tidak ditemukan."}
              trigger={
                <Button
                  id="deviceTypeId"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={deviceTypeOpen}
                  aria-label="Pilih device type"
                  disabled={deviceTypesLoading}
                  className={cn(fieldClass, "justify-between font-normal")}
                >
                  {selectedDeviceType ? (
                    <span className="truncate">{selectedDeviceType.name}</span>
                  ) : (
                    <span className="text-slate-400">
                      {deviceTypesLoading ? "Memuat tipe…" : "Pilih device type"}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              }
            >
              <CommandGroup>
                {deviceTypes.map((deviceType) => (
                  <CommandItem
                    key={deviceType.id}
                    value={`${deviceType.name} ${deviceType.code}`}
                    onSelect={() => {
                      onChange("deviceTypeId", deviceType.id);
                      setDeviceTypeOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.deviceTypeId === deviceType.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{deviceType.name}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{deviceType.code}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandPopover>
          </div>
        </div>

        <div className={gridClass}>
          <div>
            <label htmlFor="manufacturer" className="block text-sm font-medium text-slate-700">
              Manufacturer <span className="text-red-500">*</span>
            </label>
            <Input
              id="manufacturer"
              value={value.manufacturer}
              onChange={(e) => onChange("manufacturer", e.target.value)}
              className={fieldClass}
              placeholder="Masukkan merek alat"
              maxLength={150}
              required
            />
          </div>
          <div>
            <label htmlFor="model" className="block text-sm font-medium text-slate-700">
              Model <span className="text-red-500">*</span>
            </label>
            <Input
              id="model"
              value={value.model}
              onChange={(e) => onChange("model", e.target.value)}
              className={fieldClass}
              placeholder="Masukkan model/tipe alat"
              maxLength={150}
              required
            />
          </div>
        </div>

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

export function buildDeviceModelCreatePayload(form: DeviceModelFormValue) {
  const description = form.description.trim();
  return {
    deviceTypeId: form.deviceTypeId,
    manufacturer: form.manufacturer.trim(),
    model: form.model.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceModelUpdatePayload(form: DeviceModelFormValue) {
  return {
    deviceTypeId: form.deviceTypeId,
    manufacturer: form.manufacturer.trim(),
    model: form.model.trim(),
    description: form.description.trim() ? form.description.trim() : null,
  };
}

export function formatDeviceModelApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_MODEL") {
      return "Device Model dengan manufacturer dan model ini sudah ada pada tipe yang sama.";
    }
    if (code === "DEVICE_MODEL_NOT_FOUND") {
      return "Device Model tidak ditemukan.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") {
      return "Device Type yang dipilih tidak ditemukan.";
    }
    if (code === "INVALID_DEVICE_MODEL" || code === "INVALID_DEVICE_MODEL_UPDATE") {
      return "Data Device Model tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device Model. Silakan coba lagi.";
}
