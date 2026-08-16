import { describe, expect, it } from "vitest";
import { signChatSessionToken, verifyChatSessionToken } from "./chat-session-token";

const SECRET = "test-secret";

describe("signChatSessionToken / verifyChatSessionToken", () => {
  it("round-trips a valid token", () => {
    const token = signChatSessionToken("session-123", SECRET, 60_000);
    const result = verifyChatSessionToken(token, SECRET);
    expect(result).toEqual({ sessionId: "session-123" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = signChatSessionToken("session-123", SECRET, 60_000);
    expect(verifyChatSessionToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects a tampered payload (session id swapped) even if the signature string is reused", () => {
    const tokenA = signChatSessionToken("session-A", SECRET, 60_000);
    const [, signature] = tokenA.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sid: "session-B", exp: Date.now() + 60_000 }), "utf8").toString(
      "base64url",
    );
    const forged = `${forgedPayload}.${signature}`;
    expect(verifyChatSessionToken(forged, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signChatSessionToken("session-123", SECRET, 60_000);
    const [payload, signature] = token.split(".");
    const flipped = signature!.slice(0, -1) + (signature!.endsWith("0") ? "1" : "0");
    expect(verifyChatSessionToken(`${payload}.${flipped}`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signChatSessionToken("session-123", SECRET, -1);
    expect(verifyChatSessionToken(token, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyChatSessionToken("not-a-token", SECRET)).toBeNull();
    expect(verifyChatSessionToken("", SECRET)).toBeNull();
    expect(verifyChatSessionToken("a.b.c", SECRET)).toBeNull();
  });
});
