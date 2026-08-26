"use client";

import { usePathname } from "next/navigation";
import { GlobalSymbolPicker } from "@medcal/ui";

function visiblePath(pathname: string | null): string {
  if (!pathname) return "/";
  if (pathname.startsWith("/management")) return pathname.slice("/management".length) || "/";
  if (pathname.startsWith("/client")) return pathname.slice("/client".length) || "/";
  return pathname;
}

function isSignInPath(path: string): boolean {
  return path === "/sign-in" || path.startsWith("/sign-in/");
}

/** Email list/detail show EmailComposeFab at bottom-right; compose does not. */
function isEmailComposeFabPath(path: string): boolean {
  if (path.startsWith("/email/compose")) return false;
  return path === "/email" || path.startsWith("/email/");
}

export function PortalSymbolPicker() {
  const path = visiblePath(usePathname());
  if (isSignInPath(path)) return null;
  return (
    <GlobalSymbolPicker
      fabClassName={
        isEmailComposeFabPath(path) ? "bottom-24 right-6 sm:bottom-28 sm:right-8" : undefined
      }
    />
  );
}
