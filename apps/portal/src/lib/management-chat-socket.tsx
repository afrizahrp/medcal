"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { shouldNotifyChatUnread } from "./chat-unread-notify";
import { notifyContactMessagesChanged } from "./contact-messages-sync";
import { notifyUnreadCountChanged } from "./use-unread-count";
import type { ChatConnectionState, ChatWireMessage } from "./use-chat-socket";

interface ManagementChatSocketValue {
  socket: Socket | null;
  connectionState: ChatConnectionState;
  setViewedSessionId: (sessionId: string | null) => void;
}

const ManagementChatSocketContext = createContext<ManagementChatSocketValue | null>(null);

/**
 * Owns the single Management Socket.IO connection. The server joins the
 * authenticated company admin room on connect — this client never sends
 * companyId. Chat Detail must reuse `socket` via useChatSocket; it must not
 * call io() again.
 */
export function ManagementChatSocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const viewedSessionIdRef = useRef<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ChatConnectionState>("connecting");

  const setViewedSessionId = useCallback((sessionId: string | null) => {
    viewedSessionIdRef.current = sessionId;
  }, []);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const instance = io(baseUrl, {
      withCredentials: true,
      transports: ["websocket"],
    });
    socketRef.current = instance;
    setSocket(instance);

    function onConnect() {
      setConnectionState("connected");
    }
    function onDisconnect() {
      setConnectionState("disconnected");
    }
    function onConnectError() {
      setConnectionState("error");
    }
    function onMessage(message: ChatWireMessage) {
      if (!shouldNotifyChatUnread(message, viewedSessionIdRef.current)) return;
      notifyUnreadCountChanged("chat");
    }
    // New ContactMessage from any source (Contact Form, WhatsApp-lead, or a
    // brand-new Web Chat session) — server-emitted only after the row's
    // transaction commits (ChatGateway.afterInit). Reuses the exact same
    // bus Leads/[id] and Chat/[id] already publish to, so management-shell's
    // existing subscriber invalidates Leads List/Leads[id]/statistics the
    // same way a mark-read or close event does (E2E leads statistics sync
    // audit, follow-up 2026-08-25) — no new event bus.
    function onContactMessageCreated() {
      notifyContactMessagesChanged();
    }

    instance.on("connect", onConnect);
    instance.on("disconnect", onDisconnect);
    instance.on("connect_error", onConnectError);
    instance.on("message", onMessage);
    instance.on("contact_message_created", onContactMessageCreated);
    // Intentionally no "history" listener — joining a session must not
    // refetch unread-count once per historical message.

    return () => {
      instance.off("connect", onConnect);
      instance.off("disconnect", onDisconnect);
      instance.off("connect_error", onConnectError);
      instance.off("message", onMessage);
      instance.off("contact_message_created", onContactMessageCreated);
      instance.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, []);

  const value = useMemo(
    () => ({ socket, connectionState, setViewedSessionId }),
    [socket, connectionState, setViewedSessionId],
  );

  return <ManagementChatSocketContext.Provider value={value}>{children}</ManagementChatSocketContext.Provider>;
}

export function useManagementChatSocket(): ManagementChatSocketValue {
  const value = useContext(ManagementChatSocketContext);
  if (!value) {
    throw new Error("useManagementChatSocket must be used within ManagementChatSocketProvider");
  }
  return value;
}
