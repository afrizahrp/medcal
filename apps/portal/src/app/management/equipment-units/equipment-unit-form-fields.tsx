"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { selectClassName } from "./equipment-units-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface EquipmentTypeOption {
  id: string;
  code: string;
  name: string;
}

export interface EquipmentUnitFormValue {
  equipmentTypeId: string;
  code: string;
  brand: string;
  model: string;
  serialNumber: string;
  notes: string;
}

export interface EquipmentUnitFormFieldsProps {
  value: EquipmentUnitFormValue;
  onChange: <K extends keyof EquipmentUnitFormValue>(
    field: K,
    value: EquipmentUnitFormValue[K],
  ) => void;
  equipmentTypeOptions: EquipmentTypeOption[];
  /** When true the Equipment Type select is locked (edit mode keeps it changeable by default). */
  lockEquipmentType?: boolean;
}

export function EquipmentUnitFormFields({
  value,
  onChange,
  equipmentTypeOptions,
  lockEquipmentType,
}: EquipmentUnitFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Equipment Unit</h2>
        <p className="text-xs text-slate-500">
          Satu unit fisik alat referensi milik PKM. Setiap unit berada di bawah satu Equipment
          Type.
        </p>

        <div className={gridClass}>
          <div>
            <label htmlFor="equipmentTypeId" className="block text-sm font-medium text-slate-700">
              Equipment Type <span className="text-red-500">*</span>
            </label>
            <select
              id="equipmentTypeId"
              value={value.equipmentTypeId}
              onChange={(e) => onChange("equipmentTypeId", e.target.value)}
              className={`${selectClassName} ${fieldClass}`}
              disabled={lockEquipmentType}
              required
            >
              <option value="">Pilih equipment type…</option>
              {equipmentTypeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name} ({opt.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-slate-700">
              Kode <span className="text-red-500">*</span>
            </label>
            <Input
              id="code"
              value={value.code}
              onChange={(e) => onChange("code", e.target.value)}
              className={fieldClass}
              placeholder="ESA-001"
              maxLength={64}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Kode aset internal, unik dalam perusahaan.</p>
          </div>
        </div>

        <div className={gridClass}>
          <div>
            <label htmlFor="brand" className="block text-sm font-medium text-slate-700">
              Merek
            </label>
            <Input
              id="brand"
              value={value.brand}
              onChange={(e) => onChange("brand", e.target.value)}
              className={fieldClass}
              placeholder="Fluke"
              maxLength={150}
            />
          </div>
          <div>
            <label htmlFor="model" className="block text-sm font-medium text-slate-700">
              Model
            </label>
            <Input
              id="model"
              value={value.model}
              onChange={(e) => onChange("model", e.target.value)}
              className={fieldClass}
              placeholder="ESA620"
              maxLength={150}
            />
          </div>
        </div>

        <div>
          <label htmlFor="serialNumber" className="block text-sm font-medium text-slate-700">
            No. Seri
          </label>
          <Input
            id="serialNumber"
            value={value.serialNumber}
            onChange={(e) => onChange("serialNumber", e.target.value)}
            className={fieldClass}
            placeholder="mis. 12345 (opsional)"
            maxLength={100}
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
            Catatan
          </label>
          <textarea
            id="notes"
            value={value.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            className={`${selectClassName} ${fieldClass} min-h-[72px]`}
            maxLength={500}
          />
        </div>
      </section>
    </div>
  );
}

export function buildEquipmentUnitCreatePayload(form: EquipmentUnitFormValue) {
  const brand = form.brand.trim();
  const model = form.model.trim();
  const serialNumber = form.serialNumber.trim();
  const notes = form.notes.trim();
  return {
    equipmentTypeId: form.equipmentTypeId,
    code: form.code.trim(),
    ...(brand ? { brand } : {}),
    ...(model ? { model } : {}),
    ...(serialNumber ? { serialNumber } : {}),
    ...(notes ? { notes } : {}),
  };
}

export function buildEquipmentUnitUpdatePayload(
  form: EquipmentUnitFormValue & { isActive?: boolean },
) {
  return {
    equipmentTypeId: form.equipmentTypeId,
    code: form.code.trim(),
    brand: form.brand.trim() ? form.brand.trim() : null,
    model: form.model.trim() ? form.model.trim() : null,
    serialNumber: form.serialNumber.trim() ? form.serialNumber.trim() : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatEquipmentUnitApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_EQUIPMENT_CODE") {
      return "Equipment Unit dengan kode ini sudah ada di perusahaan Anda.";
    }
    if (code === "EQUIPMENT_NOT_FOUND") {
      return "Equipment Unit tidak ditemukan.";
    }
    if (code === "EQUIPMENT_TYPE_NOT_FOUND") {
      return "Equipment Type tidak ditemukan.";
    }
    if (code === "INVALID_EQUIPMENT" || code === "INVALID_EQUIPMENT_UPDATE") {
      return "Data Equipment Unit tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Equipment Unit. Silakan coba lagi.";
}
