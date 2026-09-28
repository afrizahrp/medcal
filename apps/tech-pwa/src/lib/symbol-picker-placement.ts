/**
 * UX-03 fix: `GlobalSymbolPicker`'s default fixed bottom-right FAB
 * (`packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx`, `bottom-6 right-6
 * sm:bottom-8 sm:right-8`, `z-40`) sits in the same bottom zone as Tech-PWA's
 * `StickyActionBar` (`z-20`), which every `/jobs/[id]/...` workflow screen
 * (Kontrol Alat, Physical Check, both Measurement entry variants, Reference
 * Equipment, Job Detail itself, every identity-correction wizard step) can
 * render with primary CTAs like "Simpan", "Simpan pembacaan", "Simpan Semua",
 * "Kirim hasil ke Manajer Teknis", "Selesai".
 *
 * The bare `/jobs` list and `/sign-in*` never render a `StickyActionBar`, so
 * the FAB's default position is left alone there. Every other `/jobs/...`
 * screen gets a raised `fabClassName` via the component's existing extension
 * point — no change to `GlobalSymbolPicker` itself.
 */
export function needsElevatedSymbolPickerOffset(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/jobs/");
}

/**
 * Replacement `fabClassName` for screens matched by
 * `needsElevatedSymbolPickerOffset`. Clears the tallest observed
 * `StickyActionBar` footer (NIBP's stacked status line + validation message +
 * full-width button, up to ~140px including safe-area inset on notched
 * phones) with margin, while keeping the FAB's own horizontal position
 * unchanged from the component's default.
 */
export const ELEVATED_SYMBOL_PICKER_FAB_CLASS = "bottom-36 right-6 sm:bottom-40 sm:right-8";
