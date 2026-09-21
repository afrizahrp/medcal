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
import type { DeviceManufacturerRow } from "../device-manufacturers/device-manufacturers-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceModelFormValue {
  manufacturerId: string;
  model: string;
  description: string;
}

export interface DeviceModelFormFieldsProps {
  value: DeviceModelFormValue;
  onChange: <K extends keyof DeviceModelFormValue>(
    field: K,
    value: DeviceModelFormValue[K],
  ) => void;
  manufacturers: DeviceManufacturerRow[];
  manufacturersLoading?: boolean;
}

export function DeviceModelFormFields({
  value,
  onChange,
  manufacturers,
  manufacturersLoading,
}: DeviceModelFormFieldsProps) {
  const [manufacturerOpen, setManufacturerOpen] = useState(false);
  const selectedManufacturer = manufacturers.find((m) => m.id === value.manufacturerId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Device Model</h2>

        <div className={gridClass}>
          <div>
            <label htmlFor="manufacturerId" className="block text-sm font-medium text-slate-700">
              Manufacturer <span className="text-red-500">*</span>
            </label>
            <CommandPopover
              open={manufacturerOpen}
              onOpenChange={setManufacturerOpen}
              searchPlaceholder="Cari manufacturer…"
              emptyLabel={manufacturersLoading ? "Memuat…" : "Manufacturer tidak ditemukan."}
              trigger={
                <Button
                  id="manufacturerId"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={manufacturerOpen}
                  aria-label="Pilih manufacturer"
                  disabled={manufacturersLoading}
                  className={cn(fieldClass, "justify-between font-normal")}
                >
                  {selectedManufacturer ? (
                    <span className="truncate">{selectedManufacturer.name}</span>
                  ) : (
                    <span className="text-slate-400">
                      {manufacturersLoading ? "Memuat…" : "Pilih manufacturer"}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              }
            >
              <CommandGroup>
                {manufacturers.map((manufacturer) => (
                  <CommandItem
                    key={manufacturer.id}
                    value={`${manufacturer.name} ${manufacturer.code}`}
                    onSelect={() => {
                      onChange("manufacturerId", manufacturer.id);
                      setManufacturerOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.manufacturerId === manufacturer.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{manufacturer.name}</p>
                      <p className="truncate font-mono text-xs text-slate-500">
                        {manufacturer.code}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandPopover>
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
    manufacturerId: form.manufacturerId,
    model: form.model.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceModelUpdatePayload(
  form: DeviceModelFormValue & { isActive?: boolean },
) {
  return {
    manufacturerId: form.manufacturerId,
    model: form.model.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatDeviceModelApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_MODEL") {
      return "Device Model dengan model ini sudah ada pada manufacturer yang sama.";
    }
    if (code === "DEVICE_MODEL_NOT_FOUND") {
      return "Device Model tidak ditemukan.";
    }
    if (code === "DEVICE_MANUFACTURER_NOT_FOUND") {
      return "Manufacturer yang dipilih tidak ditemukan.";
    }
    if (code === "INVALID_DEVICE_MODEL" || code === "INVALID_DEVICE_MODEL_UPDATE") {
      return "Data Device Model tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device Model. Silakan coba lagi.";
}
