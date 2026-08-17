"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@medcal/shared";

type ChatSessionStatus = "OPEN" | "CLOSED";

interface LatestMessage {
  senderType: "VISITOR" | "ADMIN";
  body: string;
  createdAt: string;
}

interface ChatSessionListItem {
  id: string;
  visitorName: string;
  visitorEmail: string;
  status: ChatSessionStatus;
  createdAt: string;
  unreadCount: number;
  latestMessage: LatestMessage | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ChatSession-based conversation list — a dedicated Chat Inbox, distinct
 * from Lead Inbox (Lead/ContactMessage). unreadCount is server-computed
 * (VISITOR messages newer than lastReadByAdminAt). Fetch-on-mount: this
 * page remounts when navigating back from /chat/[sessionId].
 */
export default function ChatInboxPage() {
  const [sessions, setSessions] = useState<ChatSessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ChatSessionListItem[]>("/chat-sessions")
      .then(setSessions)
      .catch(() => setError("Gagal memuat Chat Inbox."));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-xl font-semibold">Chat Inbox</h1>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded border border-slate-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Visitor</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Pesan terakhir</th>
              <th className="px-3 py-2">Waktu</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {!sessions ? (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={5}>
                  Memuat…
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={5}>
                  Belum ada percakapan.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/chat/${session.id}`} className="inline-flex items-center gap-2 text-brand-700 underline">
                      <span>{session.visitorName}</span>
                      {session.unreadCount > 0 ? (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[10px] font-medium leading-none text-white no-underline">
                          {session.unreadCount > 99 ? "99+" : session.unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{session.visitorEmail}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-600">
                    {session.latestMessage
                      ? `${session.latestMessage.senderType === "ADMIN" ? "Anda: " : ""}${session.latestMessage.body}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {formatDateTime(session.latestMessage?.createdAt ?? session.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        session.status === "OPEN"
                          ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                          : "rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      }
                    >
                      {session.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
