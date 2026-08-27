"use client";

import { ApiError } from "@medcal/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { moneyNumber, selectClassName, type MoneyValue } from "./tax-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface TaxFormValue {
  taxCode: string;
  description: string;
  taxRatePercent: string;
  isExclude: boolean;
}

export interface TaxFormFieldsProps {
  value: TaxFormValue;
  onChange: <K extends keyof TaxFormValue>(field: K, value: TaxFormValue[K]) => void;
}

export function fractionToPercentInput(rate: MoneyValue): string {
  const n = moneyNumber(rate) * 100;
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(4)));
}

export function percentInputToFraction(percent: string): number | null {
  const n = Number(percent);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Number((n / 100).toFixed(4));
}

export function TaxFormFields({ value, onChange }: TaxFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Tax</h2>

        <div className={gridClass}>
          <div>
            <label htmlFor="taxCode" className="block text-sm font-medium text-slate-700">
              Kode <span className="text-red-500">*</span>
            </label>
            <Input
              id="taxCode"
              value={value.taxCode}
              onChange={(e) => onChange("taxCode", e.target.value.toUpperCase())}
              className={fieldClass}
              placeholder="T1"
              maxLength={20}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Kode unik per perusahaan (huruf besar)</p>
          </div>
          <div>
            <label htmlFor="taxRatePercent" className="block text-sm font-medium text-slate-700">
              Tarif (%) <span className="text-red-500">*</span>
            </label>
            <Input
              id="taxRatePercent"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={value.taxRatePercent}
              onChange={(e) => onChange("taxRatePercent", e.target.value)}
              className={fieldClass}
              placeholder="11"
              required
            />
            <p className="mt-1 text-xs text-slate-500">Masukkan persentase, misalnya 11 untuk PPN 11%</p>
          </div>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-700">
            Deskripsi <span className="text-red-500">*</span>
          </label>
          <Input
            id="description"
            value={value.description}
            onChange={(e) => onChange("description", e.target.value)}
            className={fieldClass}
            placeholder="PPN 11%"
            maxLength={200}
            required
          />
        </div>

        <div>
          <label htmlFor="isExclude" className="block text-sm font-medium text-slate-700">
            Perlakuan harga
          </label>
          <select
            id="isExclude"
            value={value.isExclude ? "true" : "false"}
            onChange={(e) => onChange("isExclude", e.target.value === "true")}
            className={cn(selectClassName, fieldClass)}
          >
            <option value="true">Exclude — harga belum termasuk pajak</option>
            <option value="false">Include — harga sudah termasuk pajak</option>
          </select>
        </div>
      </section>
    </div>
  );
}

export function buildTaxCreatePayload(form: TaxFormValue) {
  const taxRate = percentInputToFraction(form.taxRatePercent);
  return {
    taxCode: form.taxCode.trim(),
    description: form.description.trim(),
    taxRate: taxRate ?? 0,
    isExclude: form.isExclude,
  };
}

export function buildTaxUpdatePayload(form: TaxFormValue & { isActive?: boolean }) {
  const taxRate = percentInputToFraction(form.taxRatePercent);
  return {
    taxCode: form.taxCode.trim(),
    description: form.description.trim(),
    taxRate: taxRate ?? 0,
    isExclude: form.isExclude,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatTaxApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_TAX_CODE") {
      return "Tax dengan kode ini sudah ada.";
    }
    if (code === "TAX_NOT_FOUND") {
      return "Tax tidak ditemukan.";
    }
    if (code === "INVALID_TAX" || code === "INVALID_TAX_UPDATE") {
      return "Data tax tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan tax. Silakan coba lagi.";
}
