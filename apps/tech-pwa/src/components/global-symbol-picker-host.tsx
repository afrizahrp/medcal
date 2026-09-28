"use client";

import { usePathname } from "next/navigation";
import { GlobalSymbolPicker } from "@medcal/ui";
import {
  ELEVATED_SYMBOL_PICKER_FAB_CLASS,
  needsElevatedSymbolPickerOffset,
} from "../lib/symbol-picker-placement";

function isSignInPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

/**
 * UX-03: raises the FAB above `StickyActionBar` footers via the component's
 * existing `fabClassName` extension point on every screen that can render
 * one, instead of leaving it fixed at `bottom-6 right-6` where it can overlap
 * or occlude the primary sticky action button. See
 * `lib/symbol-picker-placement.ts` for the route rule and exact offsets.
 */
export function TechPwaSymbolPicker() {
  const pathname = usePathname();
  if (isSignInPath(pathname)) return null;
  const fabClassName = needsElevatedSymbolPickerOffset(pathname)
    ? ELEVATED_SYMBOL_PICKER_FAB_CLASS
    : undefined;
  return <GlobalSymbolPicker fabClassName={fabClassName} />;
}
