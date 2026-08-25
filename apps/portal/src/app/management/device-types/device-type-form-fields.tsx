"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { selectClassName } from "./device-types-ui";
import type { DeviceCategoryRow } from "../device-categories/device-categories-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceTypeFormValue {
  code: string;
  name: string;
  categoryId: string;
  description: string;
}

export interface DeviceTypeFormFieldsProps {
  value: DeviceTypeFormValue;
  onChange: <K extends keyof DeviceTypeFormValue>(field: K, value: DeviceTypeFormValue[K]) => void;
  categories: DeviceCategoryRow[];
  categoriesLoading?: boolean;
}

export function DeviceTypeFormFields({
  value,
  onChange,
  categories,
  categoriesLoading,
}: DeviceTypeFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Device Type</h2>

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
              placeholder="BLOOD_PRESSURE_MONITOR"
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
              placeholder="Blood Pressure Monitor"
              maxLength={150}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium text-slate-700">
            Kategori <span className="text-red-500">*</span>
          </label>
          <select
            id="categoryId"
            value={value.categoryId}
            onChange={(e) => onChange("categoryId", e.target.value)}
            className={cn(selectClassName, fieldClass)}
            required
            disabled={categoriesLoading}
          >
            <option value="">{categoriesLoading ? "Memuat kategori…" : "Pilih kategori"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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

export function buildDeviceTypeCreatePayload(form: DeviceTypeFormValue) {
  const description = form.description.trim();
  return {
    categoryId: form.categoryId,
    code: form.code.trim(),
    name: form.name.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceTypeUpdatePayload(form: DeviceTypeFormValue & { isActive?: boolean }) {
  return {
    categoryId: form.categoryId,
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatDeviceTypeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_TYPE_CODE") {
      return "Device Type dengan kode ini sudah ada.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") {
      return "Device Type tidak ditemukan.";
    }
    if (code === "DEVICE_CATEGORY_NOT_FOUND") {
      return "Kategori yang dipilih tidak ditemukan.";
    }
    if (code === "INVALID_DEVICE_TYPE" || code === "INVALID_DEVICE_TYPE_UPDATE") {
      return "Data Device Type tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device Type. Silakan coba lagi.";
}
