"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, MoreHorizontal } from "lucide-react";
import { ApiError, apiFetch } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useChatSocket, type ChatWireMessage } from "../../../lib/use-chat-socket";
import { notifyUnreadCountChanged } from "../../../lib/use-unread-count";
import { cn } from "@/lib/utils";
import type { ChatSessionDetail } from "./chat-session-types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Portal admin view — own messages (ADMIN) align right; visitor messages align left. */
const PORTAL_VIEWER_TYPE = "ADMIN" as const;

function mergeMessages(base: ChatWireMessage[], live: ChatWireMessage[]): ChatWireMessage[] {
  const byId = new Map(base.map((m) => [m.id, m]));
  for (const m of live) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => a.seq - b.seq);
}

const CONNECTION_LABEL: Record<string, string> = {
  connecting: "Menghubungkan…",
  connected: "Terhubung",
  disconnected: "Terputus",
  error: "Gagal terhubung",
};

/**
 * Conversation thread extracted from /chat/[sessionId]. REST history +
 * useChatSocket live messages + markRead + composer + close. Does not
 * create its own Socket.IO connection.
 */
export function ChatConversationPanel({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ChatSessionDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(
    (readUpTo?: string) => {
      apiFetch(`/chat-sessions/${sessionId}/read`, {
        method: "PATCH",
        body: JSON.stringify(readUpTo ? { readUpTo } : {}),
      })
        .then(() => {
          notifyUnreadCountChanged("chat");
        })
        .catch(() => {});
    },
    [sessionId],
  );

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    try {
      const data = await apiFetch<ChatSessionDetail>(`/chat-sessions/${sessionId}`);
      setSession(data);
      const latest = data.messages[data.messages.length - 1];
      if (latest) markRead(latest.createdAt);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError("Gagal memuat percakapan.");
      }
    }
  }, [sessionId, markRead]);

  useEffect(() => {
    load();
  }, [load]);

  const { connectionState, liveMessages, sessionClosed, sendMessage, closeSession } = useChatSocket(sessionId);

  const markedLiveMessageIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const message of liveMessages) {
      if (markedLiveMessageIds.current.has(message.id)) continue;
      markedLiveMessageIds.current.add(message.id);
      if (message.senderType === "VISITOR") markRead(message.createdAt);
    }
  }, [liveMessages, markRead]);

  const messages = useMemo(
    () => (session ? mergeMessages(session.messages, liveMessages) : []),
    [session, liveMessages],
  );
  const isClosed = sessionClosed || session?.status === "CLOSED";

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || isClosed) return;
    sendMessage(body);
    setDraft("");
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      {notFound ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Percakapan tidak ditemukan.</p>
      ) : error ? (
        <p className="px-4 py-6 text-sm text-destructive">{error}</p>
      ) : !session ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <>
          <header className="flex shrink-0 items-start justify-between gap-3 border-b px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-start gap-1">
              <Button variant="ghost" size="icon" className="mt-0.5 h-8 w-8 shrink-0 lg:hidden" asChild>
                <Link href="/chat" aria-label="Kembali ke daftar percakapan">
                  <ArrowLeft />
                </Link>
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-foreground">{session.visitorName}</h1>
                <p className="truncate text-sm text-muted-foreground">{session.visitorEmail}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{CONNECTION_LABEL[connectionState]}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge
                variant={isClosed ? "secondary" : "outline"}
                className={cn(
                  "font-medium",
                  !isClosed && "border-green-200 bg-green-50 text-green-800 hover:bg-green-50",
                )}
              >
                {isClosed ? "CLOSED" : "OPEN"}
              </Badge>
              {!isClosed && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Aksi percakapan">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => closeSession()}>
                      <Check />
                      End chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>

          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pl-3 pt-2 sm:pl-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pesan.</p>
            ) : (
              <div className="space-y-2 pr-1" role="log" aria-live="polite" aria-relevant="additions">
                {messages.map((message) => {
                  const isOwnMessage = message.senderType === PORTAL_VIEWER_TYPE;
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", isOwnMessage ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                          isOwnMessage
                            ? "rounded-br-sm bg-brand-600 text-white"
                            : "rounded-bl-sm bg-slate-50 text-slate-900",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            isOwnMessage ? "text-white/70" : "text-slate-400",
                          )}
                        >
                          {formatTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {isClosed ? (
            <p className="shrink-0 border-t bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              Percakapan ini sudah ditutup.
            </p>
          ) : (
            <form onSubmit={handleSend} className="flex shrink-0 gap-2 border-t bg-background px-3 py-3 sm:px-4">
              <Input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Tulis balasan…"
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={!draft.trim() || connectionState !== "connected"}>
                Kirim
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
