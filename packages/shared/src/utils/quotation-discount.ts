/**
 * Quotation header discount — the single source of the percent <-> amount rule.
 *
 * The header discount is ONE value stored as two representations:
 *   headerDiscountPercent (4 dp, 0..100)   and   headerDiscountAmount (2 dp, IDR)
 * plus `headerDiscountInputMode`, which records which of the two the user typed.
 * The typed field is the source of truth; the other is derived from the
 * subtotal by this function, so the pair can never disagree
 * (e.g. 10 % with Rp150.000 on Rp1.000.000 is unrepresentable).
 *
 * Used by the API (QuotationsService) and the portal (live form preview) so the
 * rule exists exactly once. Arithmetic is exact integer (BigInt) arithmetic on
 * cents / basis units, with half-up rounding — the same convention as the
 * server's `money()` (Prisma.Decimal.ROUND_HALF_UP, 2 dp).
 *
 *   PERCENT: percent = round4(value)             amount  = round2(subtotal x percent / 100)
 *   AMOUNT : amount  = round2(value)             percent = round4(amount / subtotal x 100)
 *            (subtotal 0 => percent 0)
 *
 * Because an AMOUNT-sourced percent is a 4-dp rendering, re-applying it to the
 * same subtotal need not reproduce the exact cents; that is why the input mode
 * is persisted and re-applied instead of treating the percent as the truth.
 */

export type DiscountInputMode = "AMOUNT" | "PERCENT";

export type HeaderDiscountErrorCode =
  | "INVALID_HEADER_DISCOUNT"
  | "INVALID_HEADER_DISCOUNT_PERCENT"
  | "HEADER_DISCOUNT_EXCEEDS_SUBTOTAL";

export type HeaderDiscountResult =
  | { ok: true; amount: number; percent: number }
  | { ok: false; code: HeaderDiscountErrorCode };

const PERCENT_SCALE = 4;
const MONEY_SCALE = 2;
/** 100.0000 % expressed in 1e-4 units. */
const MAX_PERCENT_UNITS = 1_000_000n;

/**
 * Decimal -> scaled integer with HALF-UP rounding, done on the shortest decimal
 * string of the number (so 1.005 -> 1.01, not the binary-float 1.00499…).
 */
function toScaled(value: number, scale: number): bigint {
  let text = String(value);
  if (/e/i.test(text)) text = value.toFixed(12);
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  const [intPart = "0", fracPart = ""] = text.split(".");
  const frac = (fracPart + "0".repeat(scale + 1)).slice(0, scale + 1);
  let scaled = BigInt(intPart + frac.slice(0, scale));
  if (frac.charAt(scale) >= "5") scaled += 1n;
  return negative ? -scaled : scaled;
}

/** Half-up integer division for non-negative operands. */
function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Round a plain number to 2 dp half-up (IDR cents). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(toScaled(value, MONEY_SCALE)) / 10 ** MONEY_SCALE;
}

export function resolveHeaderDiscount(input: {
  subtotal: number;
  mode: DiscountInputMode;
  /** The value the user entered: a percentage for PERCENT, rupiah for AMOUNT. */
  value: number;
}): HeaderDiscountResult {
  const { subtotal, mode, value } = input;
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(subtotal) || subtotal < 0) {
    return { ok: false, code: "INVALID_HEADER_DISCOUNT" };
  }
  const subtotalCents = toScaled(subtotal, MONEY_SCALE);

  if (mode === "PERCENT") {
    const percentUnits = toScaled(value, PERCENT_SCALE);
    if (percentUnits > MAX_PERCENT_UNITS) {
      return { ok: false, code: "INVALID_HEADER_DISCOUNT_PERCENT" };
    }
    const amountCents = divHalfUp(subtotalCents * percentUnits, MAX_PERCENT_UNITS);
    return {
      ok: true,
      amount: Number(amountCents) / 10 ** MONEY_SCALE,
      percent: Number(percentUnits) / 10 ** PERCENT_SCALE,
    };
  }

  const amountCents = toScaled(value, MONEY_SCALE);
  if (amountCents > subtotalCents) {
    return { ok: false, code: "HEADER_DISCOUNT_EXCEEDS_SUBTOTAL" };
  }
  const percentUnits =
    subtotalCents === 0n ? 0n : divHalfUp(amountCents * MAX_PERCENT_UNITS, subtotalCents);
  return {
    ok: true,
    amount: Number(amountCents) / 10 ** MONEY_SCALE,
    percent: Number(percentUnits) / 10 ** PERCENT_SCALE,
  };
}
