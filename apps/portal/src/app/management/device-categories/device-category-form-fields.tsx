"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { selectClassName } from "./device-categories-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceCategoryFormValue {
  code: string;
  name: string;
  description: string;
}

export interface DeviceCategoryFormFieldsProps {
  value: DeviceCategoryFormValue;
  onChange: <K extends keyof DeviceCategoryFormValue>(
    field: K,
    value: DeviceCategoryFormValue[K],
  ) => void;
}

export function DeviceCategoryFormFields({ value, onChange }: DeviceCategoryFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Kategori</h2>

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
              placeholder="PATIENT_MONITORING"
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
              placeholder="Patient Monitoring"
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

export function buildDeviceCategoryCreatePayload(form: DeviceCategoryFormValue) {
  const description = form.description.trim();
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceCategoryUpdatePayload(form: DeviceCategoryFormValue & { isActive?: boolean }) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatDeviceCategoryApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_CATEGORY_CODE") {
      return "Device Category dengan kode ini sudah ada.";
    }
    if (code === "DEVICE_CATEGORY_NOT_FOUND") {
      return "Device Category tidak ditemukan.";
    }
    if (code === "DEVICE_CATEGORY_HAS_TYPES") {
      return "Kategori masih memiliki Device Type — hapus atau pindahkan type terlebih dahulu.";
    }
    if (code === "INVALID_DEVICE_CATEGORY" || code === "INVALID_DEVICE_CATEGORY_UPDATE") {
      return "Data Device Category tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device Category. Silakan coba lagi.";
}
