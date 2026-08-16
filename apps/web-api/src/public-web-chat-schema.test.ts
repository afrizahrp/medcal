import { describe, expect, it } from "vitest";
import { publicWebChatSchema } from "./public-web-chat-schema";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test User",
    email: "test@example.com",
    message: "Butuh info kalibrasi.",
    captchaToken: "some-token",
    ...overrides,
  };
}

describe("publicWebChatSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(publicWebChatSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("rejects a missing name", () => {
    const { name: _drop, ...payload } = validPayload();
    expect(publicWebChatSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(publicWebChatSchema.safeParse(validPayload({ email: "not-an-email" })).success).toBe(
      false,
    );
  });

  it("rejects a missing message", () => {
    const { message: _drop, ...payload } = validPayload();
    expect(publicWebChatSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a missing captchaToken", () => {
    const { captchaToken: _drop, ...payload } = validPayload();
    expect(publicWebChatSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a message exceeding the 2000-char max length (low-commitment channel, deliberately smaller than the Contact Form's 5000)", () => {
    expect(
      publicWebChatSchema.safeParse(validPayload({ message: "x".repeat(2001) })).success,
    ).toBe(false);
  });

  it("accepts a message at exactly the 2000-char boundary", () => {
    expect(
      publicWebChatSchema.safeParse(validPayload({ message: "x".repeat(2000) })).success,
    ).toBe(true);
  });

  it("silently strips phone/organizationName/topicId/getFrom/companyId if a client sends them — Web Chat never accepts these fields at all", () => {
    const result = publicWebChatSchema.safeParse(
      validPayload({
        phone: "081234567890",
        organizationName: "Some Org",
        topicId: 1,
        getFrom: "WHATSAPP",
        companyId: "SOMETHING-ELSE",
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("phone");
      expect(result.data).not.toHaveProperty("organizationName");
      expect(result.data).not.toHaveProperty("topicId");
      expect(result.data).not.toHaveProperty("getFrom");
      expect(result.data).not.toHaveProperty("companyId");
    }
  });
});
