import type { ChatWireMessage } from "../../../lib/use-chat-socket";

export type ChatSessionStatus = "OPEN" | "CLOSED";

export interface LatestMessage {
  senderType: "VISITOR" | "ADMIN";
  body: string;
  createdAt: string;
}

export interface ChatSessionListItem {
  id: string;
  visitorName: string;
  visitorEmail: string;
  status: ChatSessionStatus;
  createdAt: string;
  unreadCount: number;
  latestMessage: LatestMessage | null;
}

export interface ChatSessionDetail {
  id: string;
  visitorName: string;
  visitorEmail: string;
  status: ChatSessionStatus;
  createdAt: string;
  closedAt: string | null;
  messages: ChatWireMessage[];
}

export type ChatStatusFilter = "ALL" | "OPEN" | "CLOSED";
