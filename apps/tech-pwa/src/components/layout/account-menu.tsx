"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@medcal/auth/client";
import { SignOutButton } from "../sign-out-button";
import { usePushNotifications } from "../../lib/fcm/use-push-notifications";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PushStatusItem() {
  const { user, isAuthenticated } = useAuth();
  const { status, enable } = usePushNotifications({ authenticated: isAuthenticated, userId: user?.id });

  if (status === "unconfigured" || status === "unsupported" || status === "idle") return null;
  if (status === "enabled") {
    return (
      <p className="px-3 py-2 text-xs text-slate-500" role="status">
        Notifikasi aktif
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="px-3 py-2 text-xs text-slate-500" role="status">
        Notifikasi diblokir
      </p>
    );
  }
  if (status === "enabling") {
    return (
      <p className="px-3 py-2 text-xs text-slate-500" role="status">
        Mengaktifkan…
      </p>
    );
  }

  return (
    <div className="px-2 py-1">
      <button
        type="button"
        role="menuitem"
        className="w-full min-h-10 rounded-lg px-2 py-2.5 text-left text-sm text-slate-700 active:bg-slate-50"
        onClick={() => void enable()}
      >
        Aktifkan notifikasi
      </button>
    </div>
  );
}

/**
 * Header hamburger — opens an account dropdown (email, push status, sign out),
 * not a navigation drawer: tech-pwa has one top-level screen (Job Saya), so
 * there's nothing else to navigate to.
 */
export function AccountMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName = user?.name?.trim() || user?.email || "—";
  const initial = (displayName.charAt(0) || "?").toUpperCase();

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Menu akun"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
      >
        <MenuIcon />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-200 bg-white py-2 shadow-md"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{initial === "—" ? "—" : displayName}</p>
            <p className="truncate text-xs text-slate-500">{user?.email ?? "—"}</p>
          </div>
          <div className="border-t border-slate-100 pt-1">
            <PushStatusItem />
            <div className="px-2 pb-1">
              <SignOutButton />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
