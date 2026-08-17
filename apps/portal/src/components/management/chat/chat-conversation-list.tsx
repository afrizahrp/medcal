"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ChatSessionListItem, ChatStatusFilter } from "./chat-session-types";

function formatListTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewText(session: ChatSessionListItem): string {
  if (!session.latestMessage) return "Belum ada pesan";
  const prefix = session.latestMessage.senderType === "ADMIN" ? "Anda: " : "";
  return `${prefix}${session.latestMessage.body}`;
}

export function ChatConversationList({
  sessions,
  selectedId,
  error,
}: {
  sessions: ChatSessionListItem[] | null;
  selectedId: string | null;
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChatStatusFilter>("ALL");

  const filtered = useMemo(() => {
    if (!sessions) return [];
    const needle = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (statusFilter !== "ALL" && session.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [session.visitorName, session.visitorEmail, session.latestMessage?.body ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [sessions, query, statusFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label className="sr-only" htmlFor="chat-conversation-search">
            Cari percakapan
          </label>
          <Input
            id="chat-conversation-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, email, atau pesan…"
            className="h-9 bg-background pl-8"
          />
        </div>
        <ToggleGroup
          type="single"
          value={statusFilter}
          onValueChange={(value) => {
            if (value) setStatusFilter(value as ChatStatusFilter);
          }}
          variant="outline"
          size="sm"
          className="w-full justify-start"
          aria-label="Filter status percakapan"
        >
          <ToggleGroupItem value="ALL" className="flex-1 px-2 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="OPEN" className="flex-1 px-2 text-xs">
            Open
          </ToggleGroupItem>
          <ToggleGroupItem value="CLOSED" className="flex-1 px-2 text-xs">
            Closed
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {error ? (
          <p className="px-3 py-4 text-sm text-destructive">{error}</p>
        ) : !sessions ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Memuat…</p>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Belum ada percakapan.</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Tidak ada percakapan yang cocok.</p>
        ) : (
          <ul>
            {filtered.map((session) => {
              const isActive = session.id === selectedId;
              const isUnread = session.unreadCount > 0;
              return (
                <li key={session.id}>
                  <Link
                    href={`/chat/${session.id}`}
                    className={cn(
                      "relative flex items-start gap-3 border-b px-3 py-3 transition-colors",
                      isActive ? "bg-brand-50" : "hover:bg-muted/60",
                    )}
                  >
                    {isActive ? <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                          )}
                        >
                          {session.visitorName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatListTime(session.latestMessage?.createdAt ?? session.createdAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{session.visitorEmail}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            isUnread ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {previewText(session)}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isUnread ? (
                            <Badge className="h-4 min-w-4 justify-center px-1 text-[10px] leading-none hover:bg-primary">
                              {session.unreadCount > 99 ? "99+" : session.unreadCount}
                            </Badge>
                          ) : null}
                          <Badge
                            variant={session.status === "OPEN" ? "outline" : "secondary"}
                            className={cn(
                              "px-1.5 py-0 text-[10px] font-medium",
                              session.status === "OPEN" &&
                                "border-green-200 bg-green-50 text-green-800 hover:bg-green-50",
                            )}
                          >
                            {session.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
