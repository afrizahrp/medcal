"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import type { NavItem } from "../../app/management/nav-config";
import logo from "../../../public/logo.png";
import { CloseIcon } from "./icons";
import { SidebarNav } from "./sidebar-nav";

const DESKTOP_MQ = "(min-width: 1024px)";
export const MOBILE_DRAWER_ID = "management-mobile-drawer";

function getFocusable(container: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => {
      if (
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-hidden") === "true"
      ) {
        return false;
      }
      return element.getClientRects().length > 0;
    },
  );
}

export function MobileDrawer({
  open,
  items,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  items: NavItem[];
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (window.matchMedia(DESKTOP_MQ).matches) return;

    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
      document.removeEventListener("keydown", onKeyDown);

      if (window.matchMedia(DESKTOP_MQ).matches) return;
      const restoreTarget = returnFocusRef.current ?? previouslyFocused;
      restoreTarget?.focus?.();
    };
  }, [open, onClose, returnFocusRef]);

  if (!mounted) return null;

  return createPortal(
    <div className="lg:hidden">
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 overscroll-none"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <div
        className={[
          "pointer-events-none fixed inset-0 overflow-hidden",
          open ? "z-50" : "invisible z-0",
        ].join(" ")}
      >
        <aside
          ref={panelRef}
          id={MOBILE_DRAWER_ID}
          className={[
            "pointer-events-auto flex h-full w-sidebar-expanded max-w-[min(248px,85vw)] flex-col border-r border-slate-200 bg-white shadow-md",
            "transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full pointer-events-none",
          ].join(" ")}
          role={open ? "dialog" : undefined}
          aria-modal={open ? true : undefined}
          aria-label="Management navigation"
          aria-hidden={!open}
          inert={!open ? true : undefined}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
            <Link
              href="/"
              title="MedCal Management"
              className="flex items-center rounded-shell focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              onClick={onClose}
            >
              <Image
                src={logo}
                alt="MedCal"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded object-contain"
                priority
              />
            </Link>

            <button
              ref={closeButtonRef}
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-shell text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              aria-label="Close navigation menu"
              onClick={onClose}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
            <SidebarNav
              items={items}
              collapsed={false}
              onNavigate={onClose}
              touch
            />
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
