"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type VisitorChatPhase = "checking" | "start_form" | "chat";
export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface ChatWireMessage {
  id: string;
  sessionId: string;
  senderType: "VISITOR" | "ADMIN";
  senderUserId: string | null;
  body: string;
  clientMessageId: string | null;
  createdAt: string;
  seq: number;
}

interface StartSessionInput {
  name: string;
  email: string;
  message: string;
  captchaToken: string;
}

interface UseVisitorChatResult {
  phase: VisitorChatPhase;
  connectionState: ConnectionState;
  messages: ChatWireMessage[];
  sessionClosed: boolean;
  startSession: (input: StartSessionInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  // Returns false if the socket wasn't connected and nothing was sent —
  // callers must not act as if the message went out (e.g. must not clear
  // a draft) when this returns false.
  sendMessage: (body: string) => boolean;
}

const WEB_API_URL = process.env.NEXT_PUBLIC_WEB_API_URL ?? "http://localhost:3002";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * The ONLY place Socket.IO wiring lives for the visitor Web Chat widget.
 * Reuses the exact Phase 2 backend contract as-is: the visitor's
 * ChatSessionToken cookie (HttpOnly, server-issued by POST
 * /public/chat-sessions) is the sole credential — this hook never reads or
 * stores it directly, never sends senderUserId/companyId/senderType/role/
 * tenantId in any payload, and never invents a second auth mechanism.
 *
 * Lifecycle: a socket connection is opened once `enabled` becomes true (the
 * bubble is opened for the first time this page load) and kept alive for
 * the rest of the page's lifetime — closing/reopening the bubble does not
 * re-trigger session restoration or drop the connection. What happens next
 * is decided entirely server-side, by whether the cookie resolves to a real
 * ChatSession:
 *   - valid token -> auto-joined to the session's room, "history" arrives
 *     -> phase "chat" (this is what restores an existing conversation on
 *     reopen/page refresh, without creating a second ChatSession).
 *   - no/invalid token -> server emits "error" and disconnects -> phase
 *     "start_form" (a fresh visitor with nothing to restore).
 */
export function useVisitorChat(enabled: boolean): UseVisitorChatResult {
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const hasRestoredOnceRef = useRef(false);

  const [phase, setPhase] = useState<VisitorChatPhase>("checking");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [messages, setMessages] = useState<ChatWireMessage[]>([]);
  const [sessionClosed, setSessionClosed] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const socket = io(API_URL, {
      withCredentials: true,
      transports: ["websocket"],
      // Never auto-retry a cookie-less handshake (would just loop rejecting
      // for every anonymous visitor) — reconnection is turned on manually,
      // below, only once a real session has been confirmed at least once.
      reconnection: false,
    });
    socketRef.current = socket;
    setConnectionState("connecting");

    socket.on("connect", () => setConnectionState("connected"));
    socket.on("disconnect", () => setConnectionState("disconnected"));

    socket.on("connect_error", () => {
      setConnectionState("error");
      if (!hasRestoredOnceRef.current) setPhase("start_form");
    });

    socket.on("error", () => {
      // No valid ChatSessionToken (fresh visitor), or a runtime rejection
      // on an already-restored session — either way, this connection
      // attempt has nothing to restore.
      if (!hasRestoredOnceRef.current) setPhase("start_form");
    });

    socket.on("history", (payload: { sessionId: string; messages: ChatWireMessage[] }) => {
      hasRestoredOnceRef.current = true;
      sessionIdRef.current = payload.sessionId;
      setMessages(payload.messages);
      setPhase("chat");
      setSessionClosed(false);
      // A confirmed, real session is worth retrying through transient
      // network drops — safe to enable now.
      socket.io.reconnection(true);
    });

    socket.on("message", (message: ChatWireMessage) => {
      if (message.sessionId !== sessionIdRef.current) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });

    socket.on("session_closed", (payload: { sessionId: string }) => {
      if (payload.sessionId === sessionIdRef.current) setSessionClosed(true);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  const startSession = useCallback(
    async (input: StartSessionInput): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const res = await fetch(`${WEB_API_URL}/public/chat-sessions`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          return { ok: false, error: "Gagal mengirim pesan. Silakan coba lagi." };
        }
        const body = (await res.json().catch(() => ({}))) as { id?: string };
        if (!body.id) {
          return { ok: false, error: "Gagal mengirim pesan. Silakan coba lagi." };
        }

        hasRestoredOnceRef.current = true;
        sessionIdRef.current = body.id;
        setSessionClosed(false);
        // Optimistic paint of the visitor's own first message so it appears
        // immediately — superseded the moment authoritative "history"
        // arrives from the reconnect below.
        setMessages([
          {
            id: `optimistic-${body.id}`,
            sessionId: body.id,
            senderType: "VISITOR",
            senderUserId: null,
            body: input.message,
            clientMessageId: null,
            createdAt: new Date().toISOString(),
            seq: 0,
          },
        ]);
        setPhase("chat");

        // The ChatSessionToken cookie set by this response didn't exist
        // when this hook's socket first connected (that earlier, cookie-less
        // handshake was already rejected) — reconnect now that it does.
        const socket = socketRef.current;
        if (socket) {
          if (socket.connected) socket.disconnect();
          socket.connect();
        }

        return { ok: true };
      } catch {
        return { ok: false, error: "Terjadi kesalahan jaringan." };
      }
    },
    [],
  );

  // Returns whether the message was actually emitted (socket connected at
  // call time) — false means the caller MUST NOT treat the send as having
  // happened (e.g. must not clear a draft). This is a synchronous,
  // race-free check: `socket.connected` is read immediately before emit,
  // not from React state, so there is no stale-render window here.
  const sendMessage = useCallback((body: string): boolean => {
    const socket = socketRef.current;
    if (!socket?.connected) return false;
    // Only message content — sender identity/company are always derived
    // server-side from the authenticated socket (Phase 2 contract). No
    // sessionId either: a visitor socket has exactly one authorized
    // session and never supplies one.
    socket.emit("send_message", { body, clientMessageId: crypto.randomUUID() });
    return true;
  }, []);

  return { phase, connectionState, messages, sessionClosed, startSession, sendMessage };
}
