"use client";

import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { selectClassName } from "../quotations/quotations-ui";

export type PurchaseOrderFormValue = {
  customerPoNumber: string;
  customerPoDate: Date | undefined;
  notes: string;
};

export function PurchaseOrderFormFields({
  value,
  onChange,
  dateOpen,
  onDateOpenChange,
}: {
  value: PurchaseOrderFormValue;
  onChange: (next: PurchaseOrderFormValue) => void;
  dateOpen: boolean;
  onDateOpenChange: (open: boolean) => void;
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
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Customer PO Date</label>
          <Popover open={dateOpen} onOpenChange={onDateOpenChange}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start font-normal",
                  !value.customerPoDate && "text-slate-400",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {value.customerPoDate
                    ? format(value.customerPoDate, "PPP", { locale: localeId })
                    : "Pilih tanggal…"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.customerPoDate}
                onSelect={(date) => {
                  onChange({ ...value, customerPoDate: date });
                  onDateOpenChange(false);
                }}
                captionLayout="dropdown"
                startMonth={new Date(2020, 0)}
                endMonth={new Date(2030, 11)}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
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
