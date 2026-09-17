import type { MoneyValue } from "./quotations-ui";

/**
 * The tax breakdown line is shown unless the document's tax is in Include mode
 * (`Tax.isExclude === false`), where the tax already sits inside Total and a
 * separate line would double-state it.
 *
 * `taxIsExclude` is read live from the Tax master via the document's `taxCode`
 * — nothing about the tax mode is snapshotted on the document. An unknown mode
 * (`null`/undefined, e.g. a tax code that is no longer active) keeps the
 * previous always-show behaviour.
 */
export function shouldShowTaxLine(input: {
  taxCode?: string | null;
  taxAmount?: MoneyValue | null;
  taxIsExclude?: boolean | null;
}): boolean {
  if (input.taxIsExclude === false) return false;
  return Boolean(input.taxCode) || input.taxAmount != null;
}
