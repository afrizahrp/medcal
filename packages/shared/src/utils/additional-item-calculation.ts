/**
 * Commercial additional items (accommodation, transport, meals, …):
 *
 *   lineTotal = round2(unitPrice x qty x (multiplier ?? 1))
 *
 * `qty` (labelled by the unit, e.g. "orang") is always present; `multiplier`
 * (labelled e.g. "hari") is an optional second dimension, so "Rp100.000 per
 * person per day x 3 orang x 2 hari" and a plain "Rp150.000 x 1 paket" use the
 * same two fields. The BACKEND is the source of truth for the amount; the portal
 * mirrors this only for the live form preview, and both PDFs / the UI describe
 * the calculation with `describeAdditionalCalculation`, so the text can never
 * drift from the numbers.
 */
import { roundMoney } from "./quotation-discount";

export interface AdditionalCalculationInput {
  qty: number | string;
  unitLabel: string;
  multiplier?: number | string | null;
  multiplierLabel?: string | null;
}

/** Whole numbers print without trailing zeros ("3.0000" -> "3"). */
function plainNumber(value: number | string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "0";
}

export function additionalLineTotal(
  unitPrice: number,
  qty: number,
  multiplier?: number | null,
): number {
  return roundMoney(unitPrice * qty * (multiplier ?? 1));
}

/**
 * "Rp100.000 x 3 orang x 2 hari" — `unitPriceText` is the caller's own money
 * formatting, so the portal and the PDFs keep their existing currency style.
 */
export function describeAdditionalCalculation(
  unitPriceText: string,
  input: AdditionalCalculationInput,
): string {
  const parts = [unitPriceText, `${plainNumber(input.qty)} ${input.unitLabel}`.trim()];
  if (input.multiplier != null && input.multiplierLabel) {
    parts.push(`${plainNumber(input.multiplier)} ${input.multiplierLabel}`.trim());
  }
  return parts.join(" × ");
}
