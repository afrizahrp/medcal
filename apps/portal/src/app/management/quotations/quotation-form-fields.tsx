"use client";

import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  SOURCE_LABELS,
  SOURCE_OPTIONS,
  QuotationTotals,
  formatIdr,
  moneyNumber,
  previewTotals,
  selectClassName,
  type QuotationFormItem,
  type QuotationSource,
} from "./quotations-ui";

export type QuotationFormValue = {
  source: QuotationSource;
  validUntil: Date | undefined;
  items: QuotationFormItem[];
};

export function QuotationFormFields({
  value,
  onChange,
  dateOpen,
  onDateOpenChange,
}: {
  value: QuotationFormValue;
  onChange: (next: QuotationFormValue) => void;
  dateOpen: boolean;
  onDateOpenChange: (open: boolean) => void;
}) {
  const totals = previewTotals(value.items);

  function updateItem(index: number, patch: Partial<QuotationFormItem>) {
    onChange({
      ...value,
      items: value.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Quotation Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Source</label>
            <select
              value={value.source}
              onChange={(e) =>
                onChange({ ...value, source: e.target.value as QuotationSource })
              }
              className={cn(selectClassName, "w-full")}
            >
              {SOURCE_OPTIONS.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Valid Until</label>
            <Popover open={dateOpen} onOpenChange={onDateOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start font-normal",
                    !value.validUntil && "text-slate-400",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {value.validUntil
                      ? format(value.validUntil, "PPP", { locale: localeId })
                      : "Pilih tanggal…"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={value.validUntil}
                  onSelect={(date) => {
                    onChange({ ...value, validUntil: date });
                    onDateOpenChange(false);
                  }}
                  captionLayout="dropdown"
                  startMonth={new Date(2020, 0)}
                  endMonth={new Date(2030, 11)}
                  autoFocus
                />
                {value.validUntil ? (
                  <div className="border-t border-slate-100 p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        onChange({ ...value, validUntil: undefined });
                        onDateOpenChange(false);
                      }}
                    >
                      Hapus tanggal
                    </Button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Items</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Item mengikuti seluruh device pada Requisition. Harga satuan dapat diubah.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Deskripsi</th>
                <th className="px-3 py-2 w-24">Qty</th>
                <th className="px-3 py-2 w-40">Unit Price</th>
                <th className="px-3 py-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {value.items.map((item, index) => {
                const lineTotal = moneyNumber(item.qty || "1") * moneyNumber(item.unitPrice);
                return (
                  <tr key={item.requestItemId}>
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm font-medium text-slate-900">{item.deviceLabel}</p>
                      <p className="font-mono text-xs text-slate-400">{item.deviceIdLabel}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(index, { description: e.target.value })}
                        maxLength={500}
                        required
                        aria-label={`Deskripsi item ${index + 1}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Input
                        type="number"
                        min="0.0001"
                        step="1"
                        value={item.qty}
                        onChange={(e) => updateItem(index, { qty: e.target.value })}
                        required
                        aria-label={`Qty item ${index + 1}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                        required
                        aria-label={`Unit price item ${index + 1}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-top text-right text-sm font-medium text-slate-900">
                      {formatIdr(lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <QuotationTotals
          subtotal={totals.subtotal}
          taxAmount={null}
          totalAmount={totals.totalAmount}
          preview
        />
      </section>
    </div>
  );
}
