"use client";

import Image from "next/image";
import Link from "next/link";
import type { NavItem } from "../../app/management/nav-config";
import logo from "../../../public/logo.png";
import shortLogo from "../../../public/short-logo.png";
import { PinIcon } from "./icons";
import { SidebarNav } from "./sidebar-nav";

export function ManagementSidebar({
  items,
  collapsed,
  onToggleCollapsed,
}: {
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white shadow-sm lg:flex",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar-expanded",
      ].join(" ")}
      aria-label="Management sidebar"
    >
      <div
        className={[
          "relative flex shrink-0 items-center border-b border-slate-200",
          collapsed
            ? "h-14 justify-center gap-1 px-1"
            : "h-20 justify-center px-3",
        ].join(" ")}
      >
        <Link
          href="/"
          className="flex items-center justify-center rounded-shell focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          title="MedCal Management"
        >
          <Image
            src={collapsed ? shortLogo : logo}
            alt="MedCal"
            width={collapsed ? 36 : 160}
            height={collapsed ? 36 : 72}
            className={
              collapsed
                ? "h-9 w-9 shrink-0 rounded object-contain"
                : "h-[72px] w-auto max-w-[110px] shrink-0 rounded object-contain"
            }
            priority
          />
        </Link>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-800 transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
            collapsed
              ? "border-slate-400 text-slate-600 hover:bg-slate-50"
              : "absolute right-3 top-1/2 -translate-y-1/2 bg-brand-800 text-white hover:bg-brand-700",
          ].join(" ")}
          aria-pressed={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PinIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarNav items={items} collapsed={collapsed} />
      </div>
    </aside>
  );
}
