"use client";

import type { RefObject } from "react";
import { useAuth, useAuthz } from "@medcal/auth/client";
import { NotificationControls, UserMenu } from "./header-controls";
import { MenuIcon } from "./icons";
import { MOBILE_DRAWER_ID } from "./mobile-drawer";

export function ManagementHeader({
  mobileNavOpen,
  onOpenMobileNav,
  menuButtonRef,
}: {
  mobileNavOpen: boolean;
  onOpenMobileNav: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { user } = useAuth();
  const { membership, capabilities } = useAuthz();

  if (!user || !membership || !capabilities) {
    return null;
  }

  return (
    <header className="sticky top-0 z-20 flex w-full min-w-0 max-w-full shrink-0 flex-nowrap items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          ref={menuButtonRef}
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-shell text-slate-700 transition-colors hover:bg-slate-100 lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          aria-label="Open navigation menu"
          aria-expanded={mobileNavOpen}
          aria-controls={MOBILE_DRAWER_ID}
          aria-haspopup="dialog"
          onClick={onOpenMobileNav}
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <span className="truncate text-sm font-semibold text-slate-900 lg:hidden">MedCal</span>
        <span className="hidden truncate text-sm font-semibold text-slate-900 lg:inline">Management</span>
      </div>
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-0.5 sm:gap-1">
        <NotificationControls
          showMessages={capabilities.leadRead}
          showChat={capabilities.chatRead}
          showEmail={capabilities.emailRead}
        />
        <UserMenu
          name={user.name}
          email={user.email}
          role={membership.role}
        />
      </div>
    </header>
  );
}
