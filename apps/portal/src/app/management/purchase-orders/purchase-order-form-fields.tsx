"use client";

import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { selectClassName } from "../quotations/quotations-ui";

export type PurchaseOrderFormValue = {
  customerPoNumber: string;
  /** `YYYY-MM-DD`, or `""` when unset. */
  customerPoDate: string;
  notes: string;
};

export function PurchaseOrderFormFields({
  value,
  onChange,
}: {
  value: PurchaseOrderFormValue;
  onChange: (next: PurchaseOrderFormValue) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Purchase Order</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Customer PO No</label>
          <Input
            value={value.customerPoNumber}
            onChange={(e) => onChange({ ...value, customerPoNumber: e.target.value })}
            placeholder="PO-CUST-2026-0815"
            maxLength={100}
            aria-label="Customer PO No"
          />
        </div>
        <DateField
          label="Customer PO Date"
          value={value.customerPoDate}
          onChange={(customerPoDate) => onChange({ ...value, customerPoDate })}
          aria-label="Customer PO Date"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          className={cn(selectClassName, "min-h-[80px] w-full")}
          placeholder="Additional notes…"
          maxLength={2000}
          aria-label="Notes"
        />
      </div>
    </section>
  );
}
