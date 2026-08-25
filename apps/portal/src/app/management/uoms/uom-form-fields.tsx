"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  selectClassName,
  UOM_CATEGORY_OPTIONS,
  UOM_CATEGORY_LABELS,
  type UomCategory,
} from "./uoms-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface UomFormValue {
  code: string;
  name: string;
  symbol: string;
  category: UomCategory | "";
}

export interface UomFormFieldsProps {
  value: UomFormValue;
  onChange: <K extends keyof UomFormValue>(field: K, value: UomFormValue[K]) => void;
}

export function UomFormFields({ value, onChange }: UomFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi UOM</h2>

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
              placeholder="MMHG"
              maxLength={20}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Kode unik untuk UOM (huruf besar)</p>
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
              placeholder="Millimeter of Mercury"
              maxLength={100}
              required
            />
          </div>
        </div>

        <div className={gridClass}>
          <div>
            <label htmlFor="symbol" className="block text-sm font-medium text-slate-700">
              Simbol <span className="text-red-500">*</span>
            </label>
            <Input
              id="symbol"
              value={value.symbol}
              onChange={(e) => onChange("symbol", e.target.value)}
              className={fieldClass}
              placeholder="mmHg"
              maxLength={20}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Simbol yang ditampilkan (case-sensitive)</p>
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-slate-700">
              Kategori <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              value={value.category}
              onChange={(e) => onChange("category", e.target.value as UomCategory | "")}
              className={cn(selectClassName, fieldClass)}
              required
            >
              <option value="">Pilih kategori</option>
              {UOM_CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {UOM_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}

export function buildUomCreatePayload(form: UomFormValue) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    symbol: form.symbol.trim(),
    category: form.category as UomCategory,
  };
}

export function buildUomUpdatePayload(form: UomFormValue & { isActive?: boolean }) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    symbol: form.symbol.trim(),
    category: form.category as UomCategory,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatUomApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_UOM_CODE") {
      return "UOM dengan kode ini sudah ada.";
    }
    if (code === "UOM_NOT_FOUND") {
      return "UOM tidak ditemukan.";
    }
    if (code === "INVALID_UOM" || code === "INVALID_UOM_UPDATE") {
      return "Data UOM tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan UOM. Silakan coba lagi.";
}
