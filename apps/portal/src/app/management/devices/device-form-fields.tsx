"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DEVICE_STATUS_LABELS,
  DEVICE_STATUS_OPTIONS,
  selectClassName,
  type DeviceStatus,
} from "./devices-ui";
import type { DeviceTypeRow } from "../device-types/device-types-ui";
import type { CustomerRow } from "../customers/customers-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceFormValue {
  deviceTypeId: string;
  customerId: string;
  brand: string;
  model: string;
  serialNumber: string;
  category: string;
  status: DeviceStatus;
}

export interface DeviceFormFieldsProps {
  value: DeviceFormValue;
  onChange: <K extends keyof DeviceFormValue>(field: K, value: DeviceFormValue[K]) => void;
  deviceTypes: DeviceTypeRow[];
  deviceTypesLoading?: boolean;
  customers: CustomerRow[];
  customersLoading?: boolean;
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
                className={cn(
                  "mr-2 h-4 w-4",
                  selectedId === item.id ? "opacity-100" : "opacity-0",
                )}
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

function optionalPayload(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function DeviceFormFields({
  value,
  onChange,
  deviceTypes,
  deviceTypesLoading,
  customers,
  customersLoading,
}: DeviceFormFieldsProps) {
  const [deviceTypeOpen, setDeviceTypeOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const selectedDeviceType = deviceTypes.find((t) => t.id === value.deviceTypeId);
  const selectedCustomer = customers.find((c) => c.id === value.customerId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Informasi Device</h2>

        <div className={gridClass}>
          <ComboboxField
            id="deviceTypeId"
            label="Device Type"
            required
            open={deviceTypeOpen}
            onOpenChange={setDeviceTypeOpen}
            disabled={deviceTypesLoading}
            selectedLabel={selectedDeviceType?.name}
            placeholder="Pilih device type"
            loadingLabel="Memuat tipe…"
            searchPlaceholder="Cari device type…"
            emptyLabel="Device Type tidak ditemukan."
            items={deviceTypes.map((deviceType) => ({
              id: deviceType.id,
              label: deviceType.name,
              searchValue: `${deviceType.name} ${deviceType.code}`,
              hint: deviceType.code,
            }))}
            selectedId={value.deviceTypeId}
            onSelect={(id) => onChange("deviceTypeId", id)}
          />

          <ComboboxField
            id="customerId"
            label="Customer"
            required
            open={customerOpen}
            onOpenChange={setCustomerOpen}
            disabled={customersLoading}
            selectedLabel={
              selectedCustomer
                ? `${selectedCustomer.name} (${selectedCustomer.number})`
                : undefined
            }
            placeholder="Pilih customer"
            loadingLabel="Memuat customer…"
            searchPlaceholder="Cari customer…"
            emptyLabel="Customer tidak ditemukan."
            items={customers.map((customer) => ({
              id: customer.id,
              label: customer.name,
              searchValue: `${customer.name} ${customer.number}`,
              hint: customer.number,
            }))}
            selectedId={value.customerId}
            onSelect={(id) => onChange("customerId", id)}
          />
        </div>

        <div className={gridClass}>
          <div>
            <label htmlFor="brand" className="block text-sm font-medium text-slate-700">
              Brand
            </label>
            <Input
              id="brand"
              value={value.brand}
              onChange={(e) => onChange("brand", e.target.value)}
              className={fieldClass}
              placeholder="Masukkan merek alat"
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
              placeholder="Masukkan model/tipe alat"
              maxLength={150}
            />
          </div>
        </div>

        <div className={gridClass}>
          <div>
            <label htmlFor="serialNumber" className="block text-sm font-medium text-slate-700">
              Serial Number
            </label>
            <Input
              id="serialNumber"
              value={value.serialNumber}
              onChange={(e) => onChange("serialNumber", e.target.value)}
              className={fieldClass}
              placeholder="Masukkan nomor seri alat"
              maxLength={100}
            />
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-slate-700">
              Category
            </label>
            <Input
              id="category"
              value={value.category}
              onChange={(e) => onChange("category", e.target.value)}
              className={fieldClass}
              maxLength={150}
            />
          </div>
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="status"
            value={value.status}
            onChange={(e) => onChange("status", e.target.value as DeviceStatus)}
            className={cn(selectClassName, fieldClass, "max-w-xs")}
          >
            {DEVICE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {DEVICE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}

export function buildDeviceCreatePayload(form: DeviceFormValue) {
  return {
    deviceTypeId: form.deviceTypeId,
    customerId: form.customerId,
    ...(optionalPayload(form.brand) ? { brand: optionalPayload(form.brand) } : {}),
    ...(optionalPayload(form.model) ? { model: optionalPayload(form.model) } : {}),
    ...(optionalPayload(form.serialNumber)
      ? { serialNumber: optionalPayload(form.serialNumber) }
      : {}),
    ...(optionalPayload(form.category) ? { category: optionalPayload(form.category) } : {}),
    status: form.status,
  };
}

export function buildDeviceUpdatePayload(form: DeviceFormValue) {
  return {
    deviceTypeId: form.deviceTypeId,
    customerId: form.customerId,
    brand: optionalPayload(form.brand) ?? null,
    model: optionalPayload(form.model) ?? null,
    serialNumber: optionalPayload(form.serialNumber) ?? null,
    category: optionalPayload(form.category) ?? null,
    status: form.status,
  };
}

export function formatDeviceApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DEVICE_NOT_FOUND") {
      return "Device tidak ditemukan.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") {
      return "Device Type yang dipilih tidak ditemukan.";
    }
    if (code === "CUSTOMER_NOT_FOUND") {
      return "Customer yang dipilih tidak ditemukan.";
    }
    if (code === "DEVICE_IN_USE") {
      return "Device tidak dapat dihapus karena masih digunakan pada data kalibrasi.";
    }
    if (code === "INVALID_DEVICE" || code === "INVALID_DEVICE_UPDATE") {
      return "Data Device tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Device. Silakan coba lagi.";
}
