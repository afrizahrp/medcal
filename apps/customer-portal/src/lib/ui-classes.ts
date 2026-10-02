/**
 * The portal's few shared Tailwind class strings, so a button or field looks
 * the same wherever it appears. `@medcal/ui` only ships the symbol picker, so
 * it has no buttons, fields or banners to reuse; these live here instead.
 * Interactive controls are at least 44px high (min-h-11) for touch.
 */
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2";

export const buttonPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 active:bg-brand-800 disabled:opacity-50 ${focusRing}`;

export const buttonSecondary = `inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${focusRing}`;

/** A text link that still has a 44px-high hit area. */
export const linkAction = `inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-brand-800 hover:underline ${focusRing}`;

export const fieldClass =
  "mt-1 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600";

export const textareaClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600";

export const selectClass =
  "mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600";

export const errorBlock = "rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800";
export const emptyBlock = "rounded-lg border border-slate-200 bg-white p-4";
