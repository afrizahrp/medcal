"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { selectClassName } from "./device-capabilities-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceCapabilityFormValue {
  code: string;
  name: string;
  description: string;
}

export interface DeviceCapabilityFormFieldsProps {
  value: DeviceCapabilityFormValue;
  onChange: <K extends keyof DeviceCapabilityFormValue>(
    field: K,
    value: DeviceCapabilityFormValue[K],
  ) => void;
}

export function DeviceCapabilityFormFields({ value, onChange }: DeviceCapabilityFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Capability</h2>

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
              placeholder="NIBP"
              maxLength={64}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Kode unik (huruf besar)</p>
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
              placeholder="Non-Invasive Blood Pressure"
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

export function buildDeviceCapabilityCreatePayload(form: DeviceCapabilityFormValue) {
  const description = form.description.trim();
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceCapabilityUpdatePayload(form: DeviceCapabilityFormValue) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
  };
}

export function formatDeviceCapabilityApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_CAPABILITY_CODE") {
      return "Device Capability dengan kode ini sudah ada.";
    }
    if (code === "DEVICE_CAPABILITY_NOT_FOUND") {
      return "Device Capability tidak ditemukan.";
    }
    if (code === "DEVICE_CAPABILITY_HAS_ITEMS") {
      return "Capability masih memiliki item — hapus item terlebih dahulu.";
    }
    if (code === "DUPLICATE_DEVICE_CAPABILITY_ITEM_CODE") {
      return "Item dengan kode ini sudah ada pada capability yang sama.";
    }
    if (code === "DEVICE_CAPABILITY_ITEM_NOT_FOUND") {
      return "Capability Item tidak ditemukan.";
    }
    if (
      code === "INVALID_DEVICE_CAPABILITY" ||
      code === "INVALID_DEVICE_CAPABILITY_UPDATE" ||
      code === "INVALID_DEVICE_CAPABILITY_ITEM" ||
      code === "INVALID_DEVICE_CAPABILITY_ITEM_UPDATE"
    ) {
      return "Data tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device Capability. Silakan coba lagi.";
}
