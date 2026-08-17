import type { ChatWireMessage } from "./use-chat-socket";

/**
 * Whether a live socket "message" should refetch the header Chat unread
 * count. History is never passed here. The currently viewed session is
 * suppressed because Chat Detail's markRead() already notifies on success.
 */
export function shouldNotifyChatUnread(
  message: Pick<ChatWireMessage, "senderType" | "sessionId">,
  viewedSessionId: string | null,
): boolean {
  if (message.senderType !== "VISITOR") return false;
  if (viewedSessionId && message.sessionId === viewedSessionId) return false;
  return true;
}
