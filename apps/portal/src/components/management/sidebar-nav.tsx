"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavItem } from "../../app/management/nav-config";
import { NavIcon } from "./icons";

export function SidebarNav({
  items,
  collapsed,
}: {
  items: NavItem[];
  collapsed: boolean;
}) {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2" aria-label="Management">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item);
        const className = [
          "flex items-center gap-3 rounded-shell px-2.5 py-2.5 text-sm transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
          collapsed ? "justify-center px-0" : "",
          item.disabled
            ? "cursor-not-allowed text-slate-400 opacity-60"
            : active
              ? "bg-brand-50 font-medium text-brand-800"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        ]
          .filter(Boolean)
          .join(" ");

        const content = (
          <>
            {item.icon ? <NavIcon name={item.icon} className="h-5 w-5 shrink-0" /> : null}
            {!collapsed && <span className="truncate">{item.label}</span>}
            {collapsed && <span className="sr-only">{item.label}</span>}
          </>
        );

        const key = item.id ?? item.href;

        if (item.disabled) {
          return (
            <span
              key={key}
              className={className}
              title={collapsed ? `${item.label} — Segera hadir` : "Segera hadir"}
              aria-disabled="true"
            >
              {content}
            </span>
          );
        }

        return (
          <Link
            key={key}
            href={item.href}
            className={className}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
