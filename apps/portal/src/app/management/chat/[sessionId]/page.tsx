"use client";

import { useParams } from "next/navigation";
import { ChatConversationPanel } from "../../../../components/management/chat/chat-conversation-panel";

export default function ChatConversationPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  if (!sessionId) return null;
  return <ChatConversationPanel key={sessionId} sessionId={sessionId} />;
}
