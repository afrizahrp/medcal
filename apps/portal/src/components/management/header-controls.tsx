"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignOutButton } from "../sign-out-button";
import { useUnreadChatSessionsCount, useUnreadContactMessagesCount } from "../../lib/use-unread-count";
import { ChatIcon, EmailIcon, MessagesIcon } from "./icons";

const iconButton =
  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-shell text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:h-9 lg:w-9";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[10px] font-medium leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ContactMessagesControl() {
  const count = useUnreadContactMessagesCount();
  const label = count > 0 ? `Contact Messages, ${count} unread` : "Contact Messages";

  return (
    <Link href="/leads" className={iconButton} title={label} aria-label={label}>
      <MessagesIcon className="h-5 w-5" />
      <Badge count={count} />
    </Link>
  );
}

function WebChatControl() {
  const count = useUnreadChatSessionsCount();
  const label = count > 0 ? `Web Chat, ${count} unread` : "Web Chat";

  return (
    <Link href="/chat" className={iconButton} title={label} aria-label={label}>
      <ChatIcon className="h-5 w-5" />
      <Badge count={count} />
    </Link>
  );
}

function EmailControl() {
  return (
    <span
      className={`${iconButton} cursor-not-allowed opacity-40 hover:bg-transparent hover:text-slate-600`}
      title="Segera hadir"
      aria-disabled="true"
      aria-label="Email, Segera hadir"
    >
      <EmailIcon className="h-5 w-5" />
    </span>
  );
}

export function NotificationControls({
  showMessages,
  showChat,
}: {
  showMessages: boolean;
  showChat: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
      {showMessages ? <ContactMessagesControl /> : null}
      {showChat ? <WebChatControl /> : null}
      <EmailControl />
    </div>
  );
}

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 8 });
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName = name.trim() || email;
  const initial = (displayName.charAt(0) || "?").toUpperCase();

  function updatePosition() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }

  function toggleOpen() {
    setOpen((value) => {
      const next = !value;
      if (next) updatePosition();
      return next;
    });
  }

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

  useEffect(() => {
    if (!open) return;
    function onViewportChange() {
      updatePosition();
    }
    window.addEventListener("resize", onViewportChange);
    return () => window.removeEventListener("resize", onViewportChange);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className={iconButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        title={displayName}
        onClick={toggleOpen}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-800 text-xs font-medium text-white">
          {initial}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="fixed z-40 w-64 max-h-[min(20rem,calc(100vh-4.5rem))] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-shell border border-slate-200 bg-white py-2 shadow-md"
          style={{ top: position.top, right: position.right }}
        >
          <div className="flex gap-3 px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-800 text-sm font-medium text-white">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{email}</p>
              <p className="truncate text-xs text-slate-500">{role}</p>
            </div>
          </div>
          <div className="mt-1 border-t border-slate-100 px-2 pt-1">
            <SignOutButton className="w-full min-h-10 rounded-shell px-2 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 hover:no-underline" />
          </div>
        </div>
      )}
    </div>
  );
}
