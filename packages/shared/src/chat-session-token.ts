import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed HttpOnly cookie name shared between apps/web-api (issues, after
 * POST /public/chat-sessions) and apps/api (verifies, at the Socket.IO
 * handshake). This is the visitor's ONLY chat credential — ChatSession.id
 * itself is never accepted as one (Phase 2 threat model, Attack B/D).
 */
export const CHAT_SESSION_TOKEN_COOKIE = "chat_session_token";

interface ChatSessionTokenPayload {
  sid: string;
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("hex");
}

/**
 * Issues a signed, tamper-resistant token identifying exactly one
 * ChatSession. Not a JWT (no library, no alg-confusion surface) — a minimal
 * HMAC-signed payload is all this needs, per the locked "no JWT unless a
 * real requirement exists" decision.
 */
export function signChatSessionToken(sessionId: string, secret: string, ttlMs: number): string {
  const payload: ChatSessionTokenPayload = { sid: sessionId, exp: Date.now() + ttlMs };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies signature + expiry and returns the bound sessionId. Returns null
 * (never throws) on any malformed/tampered/expired token — callers must
 * treat null as "reject the connection," not "no token supplied" (both are
 * failures, but a caller checking token presence separately should still
 * distinguish "wasn't sent" from "was sent and is invalid" if it needs to).
 */
export function verifyChatSessionToken(token: string, secret: string): { sessionId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSignature = sign(payloadB64, secret);
  const actual = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let payload: ChatSessionTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as ChatSessionTokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.sid !== "string" || typeof payload.exp !== "number") return null;
  if (Date.now() > payload.exp) return null;

  return { sessionId: payload.sid };
}
