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
  expanded,
  pinnedExpanded,
  onTogglePin,
  onHoverStart,
  onHoverEnd,
}: {
  items: NavItem[];
  expanded: boolean;
  pinnedExpanded: boolean;
  onTogglePin: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const isHoverOverlay = expanded && !pinnedExpanded;

  function handleMouseEnter() {
    if (!pinnedExpanded) onHoverStart();
  }

  function handleMouseLeave() {
    if (!pinnedExpanded) onHoverEnd();
  }

  function handleFocusCapture() {
    if (!pinnedExpanded) onHoverStart();
  }

  function handleBlurCapture(event: React.FocusEvent<HTMLElement>) {
    if (pinnedExpanded) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onHoverEnd();
  }

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 hidden flex-col border-r border-slate-200 bg-white lg:flex",
        "transition-[width,box-shadow] duration-200 ease-out",
        expanded ? "w-sidebar-expanded" : "w-sidebar-collapsed",
        isHoverOverlay ? "z-40 shadow-lg" : "z-30 shadow-sm",
      ].join(" ")}
      aria-label="Management sidebar"
      aria-expanded={expanded}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      <div
        className={[
          "relative flex shrink-0 items-center border-b border-slate-200 px-2",
          expanded ? "h-20" : "h-14",
        ].join(" ")}
      >
        <Link
          href="/"
          className={[
            "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-shell",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
          ].join(" ")}
          title="MedCal Management"
        >
          <Image
            src={expanded ? logo : shortLogo}
            alt="MedCal"
            width={expanded ? 160 : 36}
            height={expanded ? 72 : 36}
            className={
              expanded
                ? "h-auto max-h-[72px] w-auto max-w-[110px] shrink-0 rounded object-contain"
                : "h-9 w-9 shrink-0 rounded object-contain"
            }
            priority
          />
        </Link>

        <button
          type="button"
          onClick={onTogglePin}
          className={[
            "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 shrink-0 items-center justify-center rounded-full border transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
            !expanded && "hidden",
            pinnedExpanded
              ? "border-slate-800 bg-brand-800 text-white hover:bg-brand-700"
              : "border-slate-400 text-slate-600 hover:bg-slate-50",
          ].join(" ")}
          aria-pressed={pinnedExpanded}
          aria-hidden={!expanded}
          tabIndex={expanded ? 0 : -1}
          aria-label={pinnedExpanded ? "Unpin sidebar" : "Pin sidebar open"}
          title={pinnedExpanded ? "Unpin sidebar" : "Pin sidebar open"}
        >
          <PinIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarNav items={items} collapsed={!expanded} />
      </div>
    </aside>
  );
}
