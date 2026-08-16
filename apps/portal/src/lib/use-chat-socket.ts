"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type ChatConnectionState = "connecting" | "connected" | "disconnected" | "error";

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

interface ChatSocketErrorPayload {
  code: string;
  message: string;
}

interface UseChatSocketResult {
  connectionState: ChatConnectionState;
  liveMessages: ChatWireMessage[];
  sessionClosed: boolean;
  errorCode: string | null;
  sendMessage: (body: string) => void;
  closeSession: () => void;
}

/**
 * The ONLY place Socket.IO wiring lives for the admin Chat Conversation UI —
 * kept isolated here so the page component stays plain rendering + REST
 * fetch, matching every other admin page's convention.
 *
 * Reuses the exact Phase 2 backend contract as-is: connects with the
 * existing Better Auth session cookie (withCredentials, same origin/CORS
 * setup already proven for apiFetch), never invents a second auth
 * mechanism, and never sends senderUserId/companyId/senderType/role in any
 * payload — the ChatGateway derives all of that from the authenticated
 * socket identity (see apps/api/src/modules/chat/chat.gateway.ts).
 */
export function useChatSocket(sessionId: string): UseChatSocketResult {
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ChatConnectionState>("connecting");
  const [liveMessages, setLiveMessages] = useState<ChatWireMessage[]>([]);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    setConnectionState("connecting");
    setLiveMessages([]);
    setSessionClosed(false);
    setErrorCode(null);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const socket = io(baseUrl, {
      withCredentials: true,
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionState("connected");
      // Admin identity/company/RBAC are all re-checked server-side on this
      // event — join_session is the ONLY way an admin socket is authorized
      // for a given session (see ChatGateway.handleJoinSession).
      socket.emit("join_session", { sessionId });
    });

    socket.on("disconnect", () => setConnectionState("disconnected"));
    socket.on("connect_error", () => setConnectionState("error"));

    socket.on("error", (payload: ChatSocketErrorPayload) => {
      setErrorCode(payload.code);
    });

    socket.on("message", (message: ChatWireMessage) => {
      if (message.sessionId !== sessionId) return;
      setLiveMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });

    socket.on("session_closed", (payload: { sessionId: string }) => {
      if (payload.sessionId === sessionId) setSessionClosed(true);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    (body: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      // Only body + the conversation selector — never senderUserId/
      // companyId/senderType/role. The backend is the sole source of truth
      // for admin identity (Phase 2 "ADMIN IDENTITY — NON-NEGOTIABLE" rule).
      socket.emit("send_message", {
        sessionId,
        body,
        clientMessageId: crypto.randomUUID(),
      });
    },
    [sessionId],
  );

  const closeSession = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("close_session", { sessionId });
  }, [sessionId]);

  return { connectionState, liveMessages, sessionClosed, errorCode, sendMessage, closeSession };
}
