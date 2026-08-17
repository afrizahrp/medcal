"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiFetch } from "@medcal/shared";
import { useChatSocket, type ChatWireMessage } from "../../../../lib/use-chat-socket";
import { notifyUnreadCountChanged } from "../../../../lib/use-unread-count";

type ChatSessionStatus = "OPEN" | "CLOSED";

interface ChatSessionDetail {
  id: string;
  visitorName: string;
  visitorEmail: string;
  status: ChatSessionStatus;
  createdAt: string;
  closedAt: string | null;
  messages: ChatWireMessage[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
 * Dedicated Chat Conversation thread — visitor identity + ordered
 * ChatMessage history + reply composer. Initial state loads via REST
 * (same apiFetch convention as Lead Detail); live send/receive rides the
 * ChatGateway Socket.IO contract through useChatSocket, kept fully isolated
 * from this component's own rendering concerns.
 */
export default function ChatConversationPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [session, setSession] = useState<ChatSessionDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Opening the conversation is the admin's acknowledgement — mirrors the
  // explicit ContactMessage PENDING->READ action, just triggered by viewing
  // the thread instead of a separate button (a whole-session read marker
  // has no natural per-item granularity to attach a button to). Fire-and-
  // forget: a failure here shouldn't block viewing the conversation.
  //
  // `readUpTo` ties the read watermark to a specific message's createdAt —
  // the newest one the caller actually fetched/rendered — rather than
  // wall-clock "now". That's what lets callers below represent "read up to
  // exactly what I saw," instead of "read as of whenever this request
  // happened to land" (2026-08-17 audit, Gap B).
  const markRead = useCallback(
    (readUpTo?: string) => {
      apiFetch(`/chat-sessions/${sessionId}/read`, {
        method: "PATCH",
        body: JSON.stringify(readUpTo ? { readUpTo } : {}),
      })
        .then(() => {
          // Header badge is mount-fetched only; revalidate after server-confirmed markRead.
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
      // Mark read only AFTER the initial fetch has resolved, and only up to
      // the newest message that fetch actually returned — so a visitor
      // message that arrives in the window between this GET and the
      // mark-read PATCH landing is never swallowed just because the PATCH
      // happens to complete slightly later (Gap B).
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

  // Keep an actively viewed conversation read: every newly received VISITOR
  // message that gets rendered live via the existing chat socket advances
  // the read watermark to that message, so it can't later reappear as
  // unread just because the initial markRead() above already fired (Gap A).
  // ADMIN's own messages never advance it. Message ids are unique (cuid),
  // so tracking "already marked" here is safe without resetting on session
  // change. The server-side monotonic-forward-only update in
  // ChatSessionsService.markRead makes this safe regardless of whether this
  // fires before or after the initial load's own markRead call resolves.
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

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || isClosed) return;
    // Only message content + the conversation selector go over the wire —
    // sender identity is derived server-side from the authenticated socket.
    sendMessage(body);
    setDraft("");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/chat" className="text-sm text-brand-700 underline">
        ← Kembali ke Chat Inbox
      </Link>

      {notFound ? (
        <p className="mt-6 text-sm text-slate-600">Percakapan tidak ditemukan.</p>
      ) : error ? (
        <p className="mt-6 text-sm text-red-600">{error}</p>
      ) : !session ? (
        <p className="mt-6 text-sm text-slate-400">Memuat…</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{session.visitorName}</h1>
              <p className="text-sm text-slate-600">{session.visitorEmail}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  isClosed
                    ? "rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    : "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                }
              >
                {isClosed ? "CLOSED" : "OPEN"}
              </span>
              {!isClosed && (
                <button
                  type="button"
                  onClick={closeSession}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Tutup percakapan
                </button>
              )}
            </div>
          </div>

          <p className="mt-1 text-xs text-slate-400">{CONNECTION_LABEL[connectionState]}</p>

          <ul className="mt-6 space-y-3">
            {messages.length === 0 ? (
              <li className="text-sm text-slate-400">Belum ada pesan.</li>
            ) : (
              messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.senderType === "ADMIN"
                      ? "ml-auto max-w-[75%] rounded border border-brand-200 bg-brand-50 p-3 text-sm"
                      : "mr-auto max-w-[75%] rounded border border-slate-200 p-3 text-sm"
                  }
                >
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {message.senderType === "ADMIN" ? "Admin" : session.visitorName} ·{" "}
                    {formatDateTime(message.createdAt)}
                  </p>
                </li>
              ))
            )}
          </ul>

          {isClosed ? (
            <p className="mt-6 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              Percakapan ini sudah ditutup.
            </p>
          ) : (
            <form onSubmit={handleSend} className="mt-6 flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Tulis balasan…"
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={!draft.trim() || connectionState !== "connected"}
                className="rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Kirim
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
