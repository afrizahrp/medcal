"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
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
  /**
   * "create" (default) allows editing Kode. "edit" locks Kode: it is a business
   * identifier fixed at creation and cannot be changed via the portal afterwards.
   */
  mode?: "create" | "edit";
}

export function DeviceTypeFormFields({
  value,
  onChange,
  categories,
  categoriesLoading,
  mode = "create",
}: DeviceTypeFormFieldsProps) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const selectedCategory = categories.find((c) => c.id === value.categoryId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Device Name</h2>

        <div className={gridClass}>
          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-slate-700">
              Kategori <span className="text-red-500">*</span>
            </label>
            <CommandPopover
              open={categoryOpen}
              onOpenChange={setCategoryOpen}
              searchPlaceholder="Cari kategori…"
              emptyLabel={categoriesLoading ? "Memuat…" : "Kategori tidak ditemukan."}
              trigger={
                <Button
                  id="categoryId"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={categoryOpen}
                  aria-label="Pilih kategori"
                  disabled={categoriesLoading}
                  className={cn(fieldClass, "justify-between font-normal")}
                >
                  {selectedCategory ? (
                    <span className="truncate">{selectedCategory.name}</span>
                  ) : (
                    <span className="text-slate-400">
                      {categoriesLoading ? "Memuat kategori…" : "Pilih kategori"}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              }
            >
              <CommandGroup>
                {categories.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={`${category.name} ${category.code}`}
                    onSelect={() => {
                      onChange("categoryId", category.id);
                      setCategoryOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.categoryId === category.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{category.name}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{category.code}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandPopover>
          </div>
        </div>

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
              placeholder="Blood Pressure Monitor"
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

export function buildDeviceTypeCreatePayload(form: DeviceTypeFormValue) {
  const description = form.description.trim();
  return {
    categoryId: form.categoryId,
    name: form.name.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceTypeUpdatePayload(form: DeviceTypeFormValue & { isActive?: boolean }) {
  return {
    categoryId: form.categoryId,
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatDeviceTypeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_TYPE_CODE") {
      return "Device Name dengan kode ini sudah ada.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") {
      return "Device Name tidak ditemukan.";
    }
    if (code === "DEVICE_CATEGORY_NOT_FOUND") {
      return "Kategori yang dipilih tidak ditemukan.";
    }
    if (code === "INVALID_DEVICE_TYPE" || code === "INVALID_DEVICE_TYPE_UPDATE") {
      return "Data Device Name tidak valid. Periksa kembali isian form.";
    }
    if (code === "DEVICE_TYPE_HAS_CALIBRATION_REQUESTS") {
      return "Device Name tidak dapat dihapus karena masih dipakai Requisition.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device Name. Silakan coba lagi.";
}
