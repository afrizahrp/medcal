import type { IncomingHttpHeaders } from "node:http";
import type { Socket } from "socket.io";
import { fromNodeHeaders } from "better-auth/node";
import { auth, hasPermission } from "@medcal/auth";
import { prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { CHAT_SESSION_TOKEN_COOKIE, verifyChatSessionToken } from "@medcal/shared";

export type SocketIdentity =
  | { type: "VISITOR"; sessionId: string; companyId: string }
  | { type: "ADMIN"; userId: string; companyId: string; role: MembershipRole };

export class ChatSocketAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Resolves exactly ONE authenticated identity for a Socket.IO connection —
 * either a visitor (ChatSessionToken cookie) or staff (Better Auth session
 * cookie). Never both, never neither: any failure throws, and the caller
 * (ChatGateway.handleConnection) MUST disconnect the socket, not let it sit
 * connected-but-unidentified. This function does authentication only — it
 * never touches ChatSession rows beyond confirming the visitor's own token
 * still resolves to a real session in THIS deployment's company (Attack A/B/D).
 */
export async function resolveSocketIdentity(socket: Socket): Promise<SocketIdentity> {
  const companyId = process.env.COMPANY_ID;
  if (!companyId) {
    throw new ChatSocketAuthError("MISCONFIGURED", "COMPANY_ID not configured");
  }

  const cookies = parseCookies(socket.handshake.headers.cookie);
  const chatToken = cookies[CHAT_SESSION_TOKEN_COOKIE];

  if (chatToken) {
    return resolveVisitorIdentity(chatToken, companyId);
  }

  return resolveAdminIdentity(socket.handshake.headers, companyId);
}

async function resolveVisitorIdentity(token: string, companyId: string): Promise<SocketIdentity> {
  const secret = process.env.CHAT_SESSION_TOKEN_SECRET;
  if (!secret) {
    throw new ChatSocketAuthError("MISCONFIGURED", "CHAT_SESSION_TOKEN_SECRET not configured");
  }

  const verified = verifyChatSessionToken(token, secret);
  if (!verified) {
    throw new ChatSocketAuthError("INVALID_TOKEN", "Chat session token is invalid, tampered, or expired");
  }

  // The token only proves "this is the client the token was issued to." The
  // authorized session still has to actually exist, in THIS deployment's
  // company — a token for a session that was later deleted, or one crafted
  // against a foreign companyId, must not authorize anything.
  const session = await prisma.chatSession.findFirst({
    where: { id: verified.sessionId, companyId },
    select: { id: true },
  });
  if (!session) {
    throw new ChatSocketAuthError("SESSION_NOT_FOUND", "Chat session not found");
  }

  return { type: "VISITOR", sessionId: session.id, companyId };
}

async function resolveAdminIdentity(headers: IncomingHttpHeaders, companyId: string): Promise<SocketIdentity> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  if (!session) {
    throw new ChatSocketAuthError("UNAUTHENTICATED", "No Better Auth session");
  }

  const membership = await prisma.userMembership.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId } },
    include: { user: { select: { status: true } } },
  });
  if (!membership) {
    throw new ChatSocketAuthError("NO_MEMBERSHIP", "User has no membership in this company");
  }

  // G5: access requires ACTIVE + membership. INVITED is not authorized.
  if (membership.user.status !== "ACTIVE") {
    throw new ChatSocketAuthError(
      membership.user.status === "DISABLED" ? "USER_DISABLED" : "USER_NOT_ACTIVE",
      "User account is not active",
    );
  }

  return { type: "ADMIN", userId: session.user.id, companyId: membership.companyId, role: membership.role };
}

export function requireChatPermission(role: MembershipRole, action: "read" | "reply" | "close"): boolean {
  return hasPermission(role, "chat", action);
}

export function roomForSession(sessionId: string): string {
  return `chat:${sessionId}`;
}

/** Server-derived admin inbox room — join only from authenticated identity.companyId. */
export function roomForCompany(companyId: string): string {
  return `chat:company:${companyId}`;
}
