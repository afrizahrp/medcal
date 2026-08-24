"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { NavItem } from "../../app/management/nav-config";
import { subscribeContactMessagesChanged } from "../../lib/contact-messages-sync";
import { LEAD_DETAIL_QUERY_KEY } from "../../app/management/customers/use-customers-query";
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
  nav,
  children,
}: {
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const queryClient = useQueryClient();
  const lockChatHeight = isChatWorkspacePath(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    setHydrated(true);
  }, []);

  // Shell-level listener — stays mounted while admin navigates between Chat,
  // Leads List, and Leads/[id]. refetchType: "all" refetches inactive
  // queries too (e.g. LeadsPageClient unmounted on Chat, or Leads/[id]
  // unmounted while a mark-read happens elsewhere) so every page is fresh on
  // return without a hard browser reload. LEAD_DETAIL_QUERY_KEY (unscoped —
  // invalidates every open Leads/[id]) makes Leads/[id] a subscriber/consumer
  // of this same existing mechanism instead of a new one (E2E leads
  // statistics sync audit, 2026-08-25).
  useEffect(() => {
    return subscribeContactMessagesChanged(() => {
      void queryClient.invalidateQueries({
        queryKey: ["contact-messages-statistics"],
        refetchType: "all",
      });
      void queryClient.invalidateQueries({
        queryKey: ["contact-messages"],
        refetchType: "all",
      });
      void queryClient.invalidateQueries({
        queryKey: [LEAD_DETAIL_QUERY_KEY],
        refetchType: "all",
      });
    });
  }, [queryClient]);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function togglePin() {
    setHoverExpanded(false);
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  const openMobileNav = useCallback(() => setMobileOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileOpen(false), []);

  const startSidebarHover = useCallback(() => {
    setHoverExpanded(true);
  }, []);

  const endSidebarHover = useCallback(() => {
    setHoverExpanded(false);
  }, []);

  const pinnedExpanded = !collapsed;
  const visuallyExpanded = pinnedExpanded || hoverExpanded;

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
          expanded={hydrated ? visuallyExpanded : true}
          pinnedExpanded={hydrated ? pinnedExpanded : true}
          onTogglePin={togglePin}
          onHoverStart={startSidebarHover}
          onHoverEnd={endSidebarHover}
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
