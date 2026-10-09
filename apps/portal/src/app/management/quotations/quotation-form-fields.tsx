"use client";

import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import type { AdditionalItemServiceMode } from "../additional-item-types/use-additional-item-types-query";
import { QuotationAdditionalItemsSection } from "./quotation-additional-items";
import {
  SOURCE_LABELS,
  SOURCE_OPTIONS,
  QuotationTotals,
  additionalTotalsLines,
  discountEditorTexts,
  discountErrorText,
  formatIdr,
  moneyNumber,
  previewTotals,
  selectClassName,
  todayIsoJakarta,
  type DiscountInput,
  type QuotationFormAdditionalItem,
  type QuotationFormItem,
  type QuotationSource,
  type TaxOption,
} from "./quotations-ui";

export type QuotationFormValue = {
  source: QuotationSource;
  /** Business date, `YYYY-MM-DD` (never in the future). */
  quotationDate: string;
  /** `YYYY-MM-DD`, or `""` when unset. */
  validUntil: string;
  /** Free-text remarks (Catatan); blank = none. */
  notes: string;
  taxCode: string;
  /** The header discount as typed: which field is the source + its text. */
  discount: DiscountInput;
  items: QuotationFormItem[];
  additionalItems: QuotationFormAdditionalItem[];
};

export function QuotationFormFields({
  value,
  onChange,
  taxes,
  taxesLoading,
  readOnlyItems = false,
  serviceMode,
  pricingMode = "STANDARD",
}: {
  value: QuotationFormValue;
  onChange: (next: QuotationFormValue) => void;
  taxes: TaxOption[];
  taxesLoading?: boolean;
  /**
   * New-quotation (generate) flow: qty comes from the requisition and unit price
   * is resolved server-side from the Price List — the item table is a read-only
   * preview and the operator adjusts prices afterwards on the DRAFT quotation.
   */
  readOnlyItems?: boolean;
  /** The requisition's service mode — restricts the additional-item catalog picker. */
  serviceMode?: AdditionalItemServiceMode;
  /** The customer's pricing mode (New flow): MANUAL changes the helper text. */
  pricingMode?: "STANDARD" | "MANUAL";
}) {
  const selectedTax = taxes.find((tax) => tax.taxCode === value.taxCode) ?? null;
  const totals = previewTotals(value.items, selectedTax, value.discount, value.additionalItems);
  const discountTexts = discountEditorTexts(value.discount, totals);
  const today = todayIsoJakarta();
  const backdated = value.quotationDate !== "" && value.quotationDate < today;

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="min-w-0">
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
          <DateField
            label="Quotation Date"
            value={value.quotationDate}
            onChange={(quotationDate) => onChange({ ...value, quotationDate })}
            max={today}
            required
            aria-label="Quotation Date"
          />
          <DateField
            label="Valid Until"
            value={value.validUntil}
            onChange={(validUntil) => onChange({ ...value, validUntil })}
            min={value.quotationDate || undefined}
            aria-label="Valid Until"
          />
          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tax</label>
            <select
              value={value.taxCode}
              onChange={(e) => onChange({ ...value, taxCode: e.target.value })}
              className={cn(selectClassName, "w-full")}
              disabled={taxesLoading}
              required
              aria-label="Tax code"
            >
              <option value="">{taxesLoading ? "Memuat tax…" : "Pilih tax…"}</option>
              {taxes.map((tax) => (
                <option key={tax.taxCode} value={tax.taxCode}>
                  {tax.taxCode} — {tax.description}
                </option>
              ))}
            </select>
          </div>
        </div>
        {backdated ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Quotation ini bertanggal mundur — nomor dan harga Price List mengikuti tanggal quotation,
            bukan tanggal hari ini.
          </p>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Items</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {readOnlyItems
              ? "Item, Qty, dan tarif diambil otomatis dari Requisition + Price List. Harga satuan dapat diubah setelah quotation dibuat (status DRAFT)."
              : "Item mengikuti seluruh device pada Requisition. Harga satuan dapat diubah."}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Deskripsi</th>
                <th className={cn("px-3 py-2 w-24", readOnlyItems && "text-right")}>Qty</th>
                {readOnlyItems && <th className="px-3 py-2 w-44 text-right">Harga Satuan</th>}
                {readOnlyItems && <th className="px-3 py-2 w-44 text-right">Jumlah</th>}
                {!readOnlyItems && <th className="px-3 py-2 w-36">Unit Price</th>}
                {!readOnlyItems && <th className="px-3 py-2 w-36">Discount</th>}
                {!readOnlyItems && <th className="px-3 py-2 text-right">Line Total</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {value.items.map((item, index) => {
                const lineTotal =
                  moneyNumber(item.qty || "1") * moneyNumber(item.unitPrice) -
                  moneyNumber(item.discountAmount);
                return (
                  <tr key={item.requestItemId}>
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm font-medium text-slate-900">{item.deviceLabel}</p>
                      {item.deviceTypeLabel ? (
                        <p className="text-xs text-slate-500">{item.deviceTypeLabel}</p>
                      ) : null}
                      <p className="font-mono text-xs text-slate-400">{item.deviceIdLabel}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {readOnlyItems ? (
                        <p className="text-sm text-slate-700">{item.description}</p>
                      ) : (
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          maxLength={500}
                          required
                          aria-label={`Deskripsi item ${index + 1}`}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {readOnlyItems ? (
                        <p className="text-right text-sm font-medium text-slate-900">
                          {item.qty || "1"}
                        </p>
                      ) : (
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={item.qty}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next === "" || /^\d+$/.test(next)) {
                              updateItem(index, { qty: next });
                            }
                          }}
                          onInvalid={(e) => e.preventDefault()}
                          required
                          aria-label={`Qty item ${index + 1}`}
                        />
                      )}
                    </td>
                    {readOnlyItems && (
                      <td className="px-3 py-3 align-top text-right">
                        {item.pricePending || item.unitPrice === "" ? (
                          // No Price List price for this line (MANUAL customer or no active
                          // tariff): the user types it right here, no save-then-edit trip.
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={item.unitPrice}
                            placeholder="Isi harga satuan"
                            onChange={(e) =>
                              updateItem(index, { unitPrice: e.target.value, pricePending: true })
                            }
                            className="text-right"
                            aria-label={`Harga satuan item ${index + 1}`}
                          />
                        ) : (
                          <span className="text-sm text-slate-900">
                            {formatIdr(item.unitPrice)}
                          </span>
                        )}
                      </td>
                    )}
                    {readOnlyItems && (
                      <td className="px-3 py-3 align-top text-right text-sm font-medium text-slate-900">
                        {item.unitPrice === "" ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          formatIdr(lineTotal)
                        )}
                      </td>
                    )}
                    {!readOnlyItems && (
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
                    )}
                    {!readOnlyItems && (
                      <td className="px-3 py-3 align-top">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={item.discountAmount}
                          onChange={(e) => updateItem(index, { discountAmount: e.target.value })}
                          aria-label={`Discount item ${index + 1}`}
                        />
                      </td>
                    )}
                    {!readOnlyItems && (
                      <td className="px-3 py-3 align-top text-right text-sm font-medium text-slate-900">
                        {formatIdr(lineTotal)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {readOnlyItems ? (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {pricingMode === "MANUAL"
              ? "Customer ini menggunakan harga manual: Price List tidak dipakai. Isi harga satuan setiap baris langsung di tabel ini."
              : "Tarif diterapkan otomatis dari Price List (per tanggal quotation). Baris tanpa tarif aktif dapat diisi harga satuannya langsung di tabel ini; baris yang dibiarkan kosong tidak bisa dikirim sampai harga diisi."}
          </p>
        ) : null}

        <QuotationAdditionalItemsSection
          value={value.additionalItems}
          onChange={(additionalItems) => onChange({ ...value, additionalItems })}
          serviceMode={serviceMode}
        />

        <div>
          <label
            htmlFor="quotation-notes"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Catatan / Remarks
          </label>
          <textarea
            id="quotation-notes"
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            maxLength={2000}
            rows={3}
            placeholder="Opsional — dicetak pada quotation (mis. syarat, jadwal, keterangan harga)"
            className={cn(selectClassName, "w-full min-h-[84px]")}
          />
        </div>

        <QuotationTotals
          subtotal={totals.subtotal}
          additionalLines={additionalTotalsLines(value.additionalItems)}
          discountEditor={{
            mode: value.discount.mode,
            percentText: discountTexts.percentText,
            amountText: discountTexts.amountText,
            onPercentChange: (text) =>
              onChange({ ...value, discount: { mode: "PERCENT", value: text } }),
            onAmountChange: (text) =>
              onChange({ ...value, discount: { mode: "AMOUNT", value: text } }),
            error: discountErrorText(totals.discountError),
          }}
          taxCode={selectedTax?.taxCode ?? null}
          taxRate={selectedTax?.taxRate ?? null}
          taxAmount={totals.taxAmount}
          taxIsExclude={selectedTax?.isExclude ?? null}
          totalAmount={totals.totalAmount}
        />
      </section>
    </div>
  );
}
