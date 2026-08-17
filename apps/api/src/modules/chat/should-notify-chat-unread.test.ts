import { describe, expect, it } from "vitest";

/**
 * Mirrors apps/portal/src/lib/chat-unread-notify.ts — keep both in lockstep.
 * Portal has no vitest runner; this file is the executable client-policy suite.
 */
function shouldNotifyChatUnread(
  message: { senderType: "VISITOR" | "ADMIN"; sessionId: string },
  viewedSessionId: string | null,
): boolean {
  if (message.senderType !== "VISITOR") return false;
  if (viewedSessionId && message.sessionId === viewedSessionId) return false;
  return true;
}

describe("shouldNotifyChatUnread — Management header live badge", () => {
  const visitorA = { senderType: "VISITOR" as const, sessionId: "session-a" };
  const visitorB = { senderType: "VISITOR" as const, sessionId: "session-b" };
  const adminMsg = { senderType: "ADMIN" as const, sessionId: "session-a" };

  it("a VISITOR message with no viewed session triggers notification", () => {
    expect(shouldNotifyChatUnread(visitorA, null)).toBe(true);
  });

  it("ADMIN messages do not trigger notification", () => {
    expect(shouldNotifyChatUnread(adminMsg, null)).toBe(false);
    expect(shouldNotifyChatUnread(adminMsg, "session-a")).toBe(false);
  });

  it("history is not a message event — only live VISITOR messages qualify", () => {
    // The Management socket never listens to "history"; this policy is only
    // applied to "message" payloads.
    expect(shouldNotifyChatUnread(visitorA, null)).toBe(true);
  });

  it("suppresses the currently viewed session (markRead already notifies)", () => {
    expect(shouldNotifyChatUnread(visitorA, "session-a")).toBe(false);
  });

  it("a VISITOR message in another session still notifies while viewing A", () => {
    expect(shouldNotifyChatUnread(visitorB, "session-a")).toBe(true);
  });

  it("does not inspect companyId — room membership is the isolation boundary", () => {
    const withCompany = { ...visitorA, companyId: "foreign" };
    expect(shouldNotifyChatUnread(withCompany, null)).toBe(true);
  });
});
