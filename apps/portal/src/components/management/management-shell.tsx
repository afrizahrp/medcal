"use client";

import { useEffect, useState } from "react";
import type { Me } from "../../lib/use-require-session";
import type { NavItem } from "../../app/management/nav-config";
import { SignOutButton } from "../sign-out-button";
import { ManagementSidebar } from "./sidebar";
import { readSidebarCollapsed, writeSidebarCollapsed } from "./shell-state";

/**
 * Phase 1 Management shell: desktop sidebar + existing header chrome.
 * Mobile drawer / notification cluster / user dropdown arrive in later phases.
 */
export function ManagementShell({
  me,
  nav,
  children,
}: {
  me: Me;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    setHydrated(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  const contentOffset =
    hydrated && collapsed ? "lg:ml-sidebar-collapsed" : "lg:ml-sidebar-expanded";

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-slate-900">
      <ManagementSidebar
        items={nav}
        collapsed={hydrated ? collapsed : false}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className={["flex min-h-screen min-w-0 flex-col transition-[margin] duration-200 ease-out", contentOffset].join(" ")}>
        {/* Existing header behavior preserved for Phase 1 (no notification/user-menu redesign). */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-semibold text-slate-900 lg:hidden">
              medcal Management
            </span>
            <span className="hidden text-sm font-semibold text-slate-900 lg:inline">
              Management
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm text-slate-600">
            <span className="hidden truncate sm:inline">
              {me.user.email} · {me.membership.role}
            </span>
            <span className="truncate sm:hidden">{me.user.email}</span>
            <SignOutButton />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
