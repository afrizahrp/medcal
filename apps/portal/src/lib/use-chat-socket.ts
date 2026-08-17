"use client";

import { useCallback, useEffect, useState } from "react";
import { useManagementChatSocket } from "./management-chat-socket";

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
 * Session-scoped Chat Conversation wiring on top of the shell's single
 * Socket.IO connection. Does not call io() — joining `join_session` and
 * filtering live events for this sessionId only. Unmount must not
 * disconnect the shared socket.
 */
export function useChatSocket(sessionId: string): UseChatSocketResult {
  const { socket, connectionState, setViewedSessionId } = useManagementChatSocket();
  const [liveMessages, setLiveMessages] = useState<ChatWireMessage[]>([]);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    setLiveMessages([]);
    setSessionClosed(false);
    setErrorCode(null);
    setViewedSessionId(sessionId);

    if (!socket) {
      return () => setViewedSessionId(null);
    }

    const activeSocket = socket;

    function join() {
      activeSocket.emit("join_session", { sessionId });
    }

    function onMessage(message: ChatWireMessage) {
      if (message.sessionId !== sessionId) return;
      setLiveMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    }

    function onSessionClosed(payload: { sessionId: string }) {
      if (payload.sessionId === sessionId) setSessionClosed(true);
    }

    function onError(payload: ChatSocketErrorPayload) {
      setErrorCode(payload.code);
    }

    activeSocket.on("connect", join);
    activeSocket.on("message", onMessage);
    activeSocket.on("session_closed", onSessionClosed);
    activeSocket.on("error", onError);
    if (activeSocket.connected) join();

    return () => {
      activeSocket.off("connect", join);
      activeSocket.off("message", onMessage);
      activeSocket.off("session_closed", onSessionClosed);
      activeSocket.off("error", onError);
      setViewedSessionId(null);
    };
  }, [socket, sessionId, setViewedSessionId]);

  const sendMessage = useCallback(
    (body: string) => {
      if (!socket?.connected) return;
      socket.emit("send_message", {
        sessionId,
        body,
        clientMessageId: crypto.randomUUID(),
      });
    },
    [socket, sessionId],
  );

  const closeSession = useCallback(() => {
    if (!socket?.connected) return;
    socket.emit("close_session", { sessionId });
  }, [socket, sessionId]);

  return { connectionState, liveMessages, sessionClosed, errorCode, sendMessage, closeSession };
}
