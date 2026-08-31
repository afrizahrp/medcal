"use client";

import { Input } from "@/components/ui/input";
import { selectClassName } from "./device-capabilities-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";

export interface DeviceCapabilityItemFormValue {
  name: string;
  description: string;
}

export interface DeviceCapabilityItemFormFieldsProps {
  value: DeviceCapabilityItemFormValue;
  onChange: <K extends keyof DeviceCapabilityItemFormValue>(
    field: K,
    value: DeviceCapabilityItemFormValue[K],
  ) => void;
  capabilityCode: string;
  idPrefix?: string;
}

export function DeviceCapabilityItemFormFields({
  value,
  onChange,
  capabilityCode,
  idPrefix = "item",
}: DeviceCapabilityItemFormFieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700">Capability</label>
        <p className="mt-1 font-mono text-sm text-slate-600">{capabilityCode}</p>
      </div>

      <div className={gridClass}>
        <div>
          <label
            htmlFor={`${idPrefix}-name`}
            className="block text-sm font-medium text-slate-700"
          >
            Nama <span className="text-red-500">*</span>
          </label>
          <Input
            id={`${idPrefix}-name`}
            value={value.name}
            onChange={(e) => onChange("name", e.target.value)}
            className={fieldClass}
            placeholder="Systolic Pressure"
            maxLength={150}
            required
          />
          <p className="mt-1 text-xs text-slate-500">Unik dalam capability ini</p>
        </div>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-description`}
          className="block text-sm font-medium text-slate-700"
        >
          Deskripsi
        </label>
        <textarea
          id={`${idPrefix}-description`}
          value={value.description}
          onChange={(e) => onChange("description", e.target.value)}
          className={`${selectClassName} ${fieldClass} min-h-[72px]`}
          maxLength={500}
        />
      </div>
    </div>
  );
}

export function buildDeviceCapabilityItemCreatePayload(form: DeviceCapabilityItemFormValue) {
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    ...(description ? { description } : {}),
  };
}

export function buildDeviceCapabilityItemUpdatePayload(
  form: DeviceCapabilityItemFormValue & { isActive?: boolean },
) {
  return {
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}
