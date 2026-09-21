"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { selectClassName } from "./device-manufacturers-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceManufacturerFormValue {
  code: string;
  name: string;
  description: string;
}

export interface DeviceManufacturerFormFieldsProps {
  value: DeviceManufacturerFormValue;
  onChange: <K extends keyof DeviceManufacturerFormValue>(
    field: K,
    value: DeviceManufacturerFormValue[K],
  ) => void;
  /**
   * "create" (default) shows Kode as auto-generated. "edit" locks Kode: it is
   * a business identifier fixed at creation and cannot be changed afterwards.
   */
  mode?: "create" | "edit";
}

export function DeviceManufacturerFormFields({
  value,
  onChange,
  mode = "create",
}: DeviceManufacturerFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Device Manufacturer</h2>

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
              placeholder="Omron"
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

export function buildDeviceManufacturerCreatePayload(form: DeviceManufacturerFormValue) {
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceManufacturerUpdatePayload(
  form: DeviceManufacturerFormValue & { isActive?: boolean },
) {
  return {
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatDeviceManufacturerApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_MANUFACTURER") {
      return "Device Manufacturer dengan nama ini sudah ada.";
    }
    if (code === "DEVICE_MANUFACTURER_NOT_FOUND") {
      return "Device Manufacturer tidak ditemukan.";
    }
    if (code === "DEVICE_MANUFACTURER_HAS_MODELS") {
      return "Device Manufacturer tidak dapat dihapus karena masih memiliki Device Model.";
    }
    if (code === "INVALID_DEVICE_MANUFACTURER" || code === "INVALID_DEVICE_MANUFACTURER_UPDATE") {
      return "Data Device Manufacturer tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device Manufacturer. Silakan coba lagi.";
}
