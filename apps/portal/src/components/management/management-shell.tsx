"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Me } from "../../lib/use-require-session";
import type { NavItem } from "../../app/management/nav-config";
import { ManagementHeader } from "./header";
import { MobileDrawer } from "./mobile-drawer";
import { ManagementSidebar } from "./sidebar";
import { ManagementChatSocketProvider } from "../../lib/management-chat-socket";
import { readSidebarCollapsed, writeSidebarCollapsed } from "./shell-state";

const DESKTOP_MQ = "(min-width: 1024px)";

function isChatWorkspacePath(pathname: string): boolean {
  return (
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/management/chat" ||
    pathname.startsWith("/management/chat/")
  );
}

/**
 * Management shell: desktop sidebar + mobile drawer + header notifications + user menu.
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
  const pathname = usePathname() ?? "/";
  const lockChatHeight = isChatWorkspacePath(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  const openMobileNav = useCallback(() => setMobileOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileOpen(false), []);

  const contentOffset =
    hydrated && collapsed ? "lg:ml-sidebar-collapsed" : "lg:ml-sidebar-expanded";

  return (
    <ManagementChatSocketProvider>
      <div
        className={[
          "w-full max-w-full overflow-x-hidden bg-canvas text-slate-900",
          lockChatHeight ? "h-dvh overflow-hidden" : "min-h-screen",
        ].join(" ")}
      >
        <ManagementSidebar
          items={nav}
          collapsed={hydrated ? collapsed : false}
          onToggleCollapsed={toggleCollapsed}
        />

        <MobileDrawer
          open={mobileOpen}
          items={nav}
          onClose={closeMobileNav}
          returnFocusRef={menuButtonRef}
        />

        <div
          className={[
            "flex min-w-0 max-w-full flex-col transition-[margin] duration-200 ease-out",
            lockChatHeight ? "h-dvh overflow-hidden" : "min-h-screen",
            contentOffset,
          ].join(" ")}
          inert={mobileOpen ? true : undefined}
        >
          <ManagementHeader
            me={me}
            mobileNavOpen={mobileOpen}
            onOpenMobileNav={openMobileNav}
            menuButtonRef={menuButtonRef}
          />

          <main
            className={[
              "flex min-w-0 flex-1 flex-col overflow-x-hidden",
              lockChatHeight ? "min-h-0 overflow-hidden" : "",
            ].join(" ")}
          >
            {children}
          </main>
        </div>
      </div>
    </ManagementChatSocketProvider>
  );
}
