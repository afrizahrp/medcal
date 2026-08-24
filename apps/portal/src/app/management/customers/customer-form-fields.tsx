"use client";

import { Input } from "@/components/ui/input";
import { selectClassName } from "./customers-ui";

const fieldClass = "mt-1 w-full";
const gridClass = "grid gap-4 sm:grid-cols-2";
const sectionFieldsClass = "space-y-3";

export interface CustomerFormFieldsValue {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  mobile: string;
  email: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
}

export interface CustomerFormFieldsProps {
  value: CustomerFormFieldsValue;
  onChange: <K extends keyof CustomerFormFieldsValue>(
    field: K,
    next: CustomerFormFieldsValue[K],
  ) => void;
  nameRequired?: boolean;
}

export function CustomerFormFields({
  value,
  onChange,
  nameRequired = true,
}: CustomerFormFieldsProps) {
  return (
    <div className="space-y-5">
      <section className={sectionFieldsClass}>
        <h2 className="text-sm font-semibold text-slate-900">Customer information</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Name {nameRequired ? <span className="text-red-500">*</span> : null}
          </label>
          <Input
            value={value.name}
            onChange={(e) => onChange("name", e.target.value)}
            className={fieldClass}
            required={nameRequired}
          />
        </div>

        <div className={gridClass}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Legal name</label>
            <Input
              value={value.legalName}
              onChange={(e) => onChange("legalName", e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Tax ID / NPWP</label>
            <Input
              value={value.taxId}
              onChange={(e) => onChange("taxId", e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Address</label>
          <textarea
            value={value.address}
            onChange={(e) => onChange("address", e.target.value)}
            className={`${selectClassName} ${fieldClass} min-h-[72px]`}
          />
        </div>

        <div className={gridClass}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Phone</label>
            <Input
              value={value.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Mobile</label>
            <Input
              value={value.mobile}
              onChange={(e) => onChange("mobile", e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <Input
            type="email"
            value={value.email}
            onChange={(e) => onChange("email", e.target.value)}
            className={fieldClass}
          />
        </div>
      </section>

      <section className={`${sectionFieldsClass} border-t border-slate-100 pt-5`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Primary contact</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Optional — email is checked for duplicates within your company.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Contact name</label>
          <Input
            value={value.contactName}
            onChange={(e) => onChange("contactName", e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className={gridClass}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <Input
              type="email"
              value={value.contactEmail}
              onChange={(e) => onChange("contactEmail", e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Phone</label>
            <Input
              value={value.contactPhone}
              onChange={(e) => onChange("contactPhone", e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        {/* <div>
          <label className="block text-sm font-medium text-slate-700">Title</label>
          <Input
            value={value.contactTitle}
            onChange={(e) => onChange("contactTitle", e.target.value)}
            className={fieldClass}
          />
        </div> */}
      </section>
    </div>
  );
}
