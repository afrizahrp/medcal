"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { selectClassName } from "./equipment-types-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface EquipmentTypeFormValue {
  code: string;
  name: string;
  description: string;
  category: string;
}

export interface EquipmentTypeFormFieldsProps {
  value: EquipmentTypeFormValue;
  onChange: <K extends keyof EquipmentTypeFormValue>(
    field: K,
    value: EquipmentTypeFormValue[K],
  ) => void;
  /**
   * "create" (default) allows editing Kode. "edit" locks Kode: it is a business
   * identifier fixed at creation and cannot be changed via the portal afterwards.
   */
  mode?: "create" | "edit";
}

export function EquipmentTypeFormFields({
  value,
  onChange,
  mode = "create",
}: EquipmentTypeFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Equipment Type</h2>
        <p className="text-xs text-slate-500">
          Equipment Type adalah <strong>jenis/kategori</strong> alat kalibrasi yang diperlukan
          (mis. &quot;Electrical Safety Analyzer&quot;) — bukan unit fisik dengan nomor seri.
        </p>

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
              placeholder="ELECTRICAL_SAFETY_ANALYZER"
              maxLength={64}
              required
              disabled={mode === "edit"}
            />
            <p className="mt-1 text-xs text-slate-500">
              {mode === "edit"
                ? "Kode tidak dapat diubah setelah dibuat"
                : "Kode unik (huruf besar)"}
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
              placeholder="Electrical Safety Analyzer"
              maxLength={150}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-slate-700">
            Kategori
          </label>
          <Input
            id="category"
            value={value.category}
            onChange={(e) => onChange("category", e.target.value)}
            className={fieldClass}
            placeholder="mis. Analyzer, Simulator, Lingkungan"
            maxLength={100}
          />
          <p className="mt-1 text-xs text-slate-500">Pengelompokan bebas (opsional).</p>
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

export function buildEquipmentTypeCreatePayload(form: EquipmentTypeFormValue) {
  const description = form.description.trim();
  const category = form.category.trim();
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
  };
}

export function buildEquipmentTypeUpdatePayload(form: EquipmentTypeFormValue & { isActive?: boolean }) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    category: form.category.trim() ? form.category.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatEquipmentTypeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_EQUIPMENT_TYPE_CODE") {
      return "Equipment Type dengan kode ini sudah ada.";
    }
    if (code === "EQUIPMENT_TYPE_NOT_FOUND") {
      return "Equipment Type tidak ditemukan.";
    }
    if (code === "EQUIPMENT_TYPE_HAS_REQUIREMENTS") {
      return "Equipment Type masih dipakai sebagai kebutuhan pada Device Name — hapus kebutuhannya dahulu.";
    }
    if (code === "INVALID_EQUIPMENT_TYPE" || code === "INVALID_EQUIPMENT_TYPE_UPDATE") {
      return "Data Equipment Type tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Equipment Type. Silakan coba lagi.";
}
