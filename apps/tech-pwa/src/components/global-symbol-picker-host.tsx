"use client";

import { usePathname } from "next/navigation";
import { GlobalSymbolPicker } from "@medcal/ui";

function isSignInPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

export function TechPwaSymbolPicker() {
  const pathname = usePathname();
  if (isSignInPath(pathname)) return null;
  return <GlobalSymbolPicker />;
}
