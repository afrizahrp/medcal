"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DeviceTypeRow } from "../device-types/device-types-ui";
import type { DevicePhysicalCheckItemFormValue } from "./device-physical-check-item-form-utils";

export type { DevicePhysicalCheckItemFormValue } from "./device-physical-check-item-form-utils";
export {
  buildDevicePhysicalCheckItemCreatePayload,
  buildDevicePhysicalCheckItemUpdatePayload,
  formatDevicePhysicalCheckItemApiError,
  validateDevicePhysicalCheckItemForm,
} from "./device-physical-check-item-form-utils";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DevicePhysicalCheckItemFormFieldsProps {
  value: DevicePhysicalCheckItemFormValue;
  onChange: <K extends keyof DevicePhysicalCheckItemFormValue>(
    field: K,
    value: DevicePhysicalCheckItemFormValue[K],
  ) => void;
  deviceTypes: DeviceTypeRow[];
  deviceTypesLoading?: boolean;
  /**
   * "create" exposes the Device Type picker.
   * "edit" locks Device Type ownership and shows a read-only context bar.
   */
  mode?: "create" | "edit";
}

function ComboboxField({
  id,
  label,
  required,
  open,
  onOpenChange,
  disabled,
  selectedLabel,
  placeholder,
  loadingLabel,
  searchPlaceholder,
  emptyLabel,
  items,
  selectedId,
  onSelect,
}: {
  id: string;
  label: string;
  required?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  selectedLabel?: string;
  placeholder: string;
  loadingLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  items: Array<{ id: string; label: string; searchValue: string; hint?: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <CommandPopover
        open={open}
        onOpenChange={onOpenChange}
        searchPlaceholder={searchPlaceholder}
        emptyLabel={disabled ? loadingLabel : emptyLabel}
        trigger={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            disabled={disabled}
            className={cn(fieldClass, "justify-between font-normal")}
          >
            {selectedLabel ? (
              <span className="truncate">{selectedLabel}</span>
            ) : (
              <span className="text-slate-400">{disabled ? loadingLabel : placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      >
        <CommandGroup>
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={item.searchValue}
              onSelect={() => {
                onSelect(item.id);
                onOpenChange(false);
              }}
            >
              <Check
                className={cn("mr-2 h-4 w-4", selectedId === item.id ? "opacity-100" : "opacity-0")}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.label}</p>
                {item.hint ? (
                  <p className="truncate font-mono text-xs text-slate-500">{item.hint}</p>
                ) : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandPopover>
    </div>
  );
}

export function DevicePhysicalCheckItemFormFields({
  value,
  onChange,
  deviceTypes,
  deviceTypesLoading,
  mode = "create",
}: DevicePhysicalCheckItemFormFieldsProps) {
  const [deviceTypeOpen, setDeviceTypeOpen] = useState(false);
  const selectedDeviceType = deviceTypes.find((t) => t.id === value.deviceTypeId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Physical Inspection</h2>

        {mode === "edit" ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Konteks (tidak dapat diubah)
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {selectedDeviceType?.name ?? "—"}
            </p>
          </div>
        ) : (
          <div className={gridClass}>
            <ComboboxField
              id="deviceTypeId"
              label="Device Name"
              required
              open={deviceTypeOpen}
              onOpenChange={setDeviceTypeOpen}
              disabled={deviceTypesLoading}
              selectedLabel={selectedDeviceType?.name}
              placeholder="Pilih device name"
              loadingLabel="Memuat…"
              searchPlaceholder="Cari device name…"
              emptyLabel="Device Name tidak ditemukan."
              items={deviceTypes.map((deviceType) => ({
                id: deviceType.id,
                label: deviceType.name,
                searchValue: `${deviceType.name} ${deviceType.code}`,
                hint: deviceType.code,
              }))}
              selectedId={value.deviceTypeId}
              onSelect={(id) => onChange("deviceTypeId", id)}
            />
          </div>
        )}

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
              Item / Parameter <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              value={value.name}
              onChange={(e) => onChange("name", e.target.value)}
              className={fieldClass}
              placeholder="Kondisi fisik keseluruhan"
              maxLength={200}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="inspectionLimit" className="block text-sm font-medium text-slate-700">
            Batas Pemeriksaan <span className="text-red-500">*</span>
          </label>
          <Input
            id="inspectionLimit"
            value={value.inspectionLimit}
            onChange={(e) => onChange("inspectionLimit", e.target.value)}
            className={fieldClass}
            placeholder="Tidak rusak / penyok / retak"
            maxLength={500}
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Teks batas pemeriksaan fisik sesuai master LK (wajib diisi).
          </p>
        </div>
      </section>
    </div>
  );
}
