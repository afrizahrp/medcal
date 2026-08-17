"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@medcal/shared";

export type UnreadCountDomain = "contact" | "chat";

type UnreadCountListener = (domain?: UnreadCountDomain) => void;

/**
 * Module-level pub/sub — no Zustand / TanStack Query.
 * Detail pages signal "unread state changed"; this hook re-fetches the
 * canonical server count. Count business rules stay on the API.
 */
const listeners = new Set<UnreadCountListener>();

/** Call after a successful server-confirmed read mutation, or when a live
 * VISITOR message arrives on a session the admin is not currently viewing. */
export function notifyUnreadCountChanged(domain?: UnreadCountDomain): void {
  for (const listener of listeners) listener(domain);
}

function subscribeUnreadCount(listener: UnreadCountListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Thin data-fetch only — the "unread" business rule itself lives server-side
// (ContactMessagesService.countUnread / ChatSessionsService.countUnread), not
// here. Fetches on mount and whenever notifyUnreadCountChanged() fires for
// this domain (or for all domains).
function useUnreadCount(endpoint: string, domain: UnreadCountDomain): number {
  const [count, setCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    return subscribeUnreadCount((changed) => {
      if (changed && changed !== domain) return;
      setRefreshKey((key) => key + 1);
    });
  }, [domain]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ count: number }>(endpoint)
      .then((res) => {
        if (!cancelled) setCount(res.count);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, refreshKey]);

  return count;
}

// Contact Form + WhatsApp + Web Chat first-touch messages not yet marked
// READ by an admin (single shared ContactMessage.status field — see
// ContactMessagesService.countUnread).
export function useUnreadContactMessagesCount(): number {
  return useUnreadCount("/contact-messages/unread-count", "contact");
}

// Web Chat sessions with a visitor message newer than the admin's last read
// (see ChatSessionsService.countUnread) — NOT open-session count.
export function useUnreadChatSessionsCount(): number {
  return useUnreadCount("/chat-sessions/unread-count", "chat");
}
