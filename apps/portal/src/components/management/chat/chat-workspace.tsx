"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@medcal/shared";
import { subscribeUnreadCount } from "../../../lib/use-unread-count";
import { PageHeader } from "../page-header";
import { ChatConversationList } from "./chat-conversation-list";
import type { ChatSessionListItem } from "./chat-session-types";

function selectedSessionIdFromPath(pathname: string): string | null {
  const prefixes = ["/chat/", "/management/chat/"];
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      const id = pathname.slice(prefix.length).split("/")[0];
      return id || null;
    }
  }
  return null;
}

/**
 * Two-pane chat workspace. Left list is owned here so search/filter survive
 * /chat ↔ /chat/[sessionId] navigation. Right pane is the route child.
 */
export function ChatWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const selectedId = selectedSessionIdFromPath(pathname);
  const [sessions, setSessions] = useState<ChatSessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback((isInitial: boolean) => {
    apiFetch<ChatSessionListItem[]>("/chat-sessions")
      .then((data) => {
        setSessions(data);
        setError(null);
      })
      .catch(() => {
        if (isInitial) setError("Gagal memuat Chat Inbox.");
      });
  }, []);

  useEffect(() => {
    loadSessions(true);
  }, [loadSessions]);

  useEffect(() => {
    return subscribeUnreadCount((domain) => {
      if (domain && domain !== "chat") return;
      loadSessions(false);
    });
  }, [loadSessions]);

  const selectedSession = sessions?.find((session) => session.id === selectedId) ?? null;
  const crumbs = selectedSession
    ? [
        { href: "/", label: "Dashboard" },
        { href: "/chat", label: "Chat" },
        { label: selectedSession.visitorName },
      ]
    : [{ href: "/", label: "Dashboard" }, { label: "Chat" }];

  const listPaneClass = [
    "flex min-h-0 flex-1 flex-col border-slate-200 bg-white",
    selectedId
      ? "max-lg:hidden lg:flex-none lg:w-[36%] lg:max-w-md lg:shrink-0 lg:border-r"
      : "w-full lg:flex-none lg:w-[36%] lg:max-w-md lg:shrink-0 lg:border-r",
  ].join(" ");

  const detailPaneClass = [
    "min-h-0 min-w-0 flex-1 flex-col bg-white",
    selectedId ? "flex" : "hidden lg:flex",
  ].join(" ");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-canvas lg:p-3">
      <div className="shrink-0 border-b bg-white px-4 py-4 lg:mx-3 lg:mt-3 lg:rounded-t-shell lg:border lg:border-b-0 lg:border-slate-200">
        <PageHeader title="Chat" crumbs={crumbs} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:mx-3 lg:mb-3 lg:flex-row lg:rounded-b-shell lg:border lg:border-t lg:border-slate-200">
        <section className={listPaneClass} aria-label="Daftar percakapan">
          <ChatConversationList sessions={sessions} selectedId={selectedId} error={error} />
        </section>

        <section className={detailPaneClass} aria-label="Percakapan aktif">
          {selectedId ? (
            children
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-foreground">Pilih percakapan</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pilih percakapan dari inbox untuk melihat pesan.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
