"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [{ href: "/work-orders", label: "Kalibrasi Alat" }] as const;

/** True for the item's own page and anything nested under it (a work-order detail keeps "Work Order" active). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi utama">
      <ul className="flex items-center gap-1">
        {ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  active ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
