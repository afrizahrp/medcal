import type { MoneyValue, QuotationFormItem } from "./quotations-ui";

/**
 * One line of the read-only price preview returned by `POST /quotations/preview`.
 * `unitPrice` / `lineTotal` are the exact values the quotation will carry once
 * created (the server resolves them the same way for both endpoints).
 */
export interface QuotationPreviewLine {
  requestItemId: string;
  description: string;
  qty: MoneyValue;
  unitPrice: MoneyValue;
  lineTotal: MoneyValue;
  pricePending: boolean;
}

export interface QuotationPreviewResponse {
  items: QuotationPreviewLine[];
}

/**
 * Overlay the server-resolved Price List tariffs onto the read-only requisition
 * item rows. A `pricePending` line keeps an empty `unitPrice` so the existing
 * "harga belum dikonfigurasi" treatment continues to apply.
 */
export function applyResolvedPrices(
  items: QuotationFormItem[],
  previewLines: QuotationPreviewLine[] | undefined,
): QuotationFormItem[] {
  if (!previewLines || previewLines.length === 0) return items;
  const byId = new Map(previewLines.map((line) => [line.requestItemId, line]));
  return items.map((item) => {
    const resolved = byId.get(item.requestItemId);
    if (!resolved) return item;
    return {
      ...item,
      unitPrice: resolved.pricePending ? "" : String(resolved.unitPrice),
      pricePending: resolved.pricePending,
    };
  });
}
