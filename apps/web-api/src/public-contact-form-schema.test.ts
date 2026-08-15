import { describe, expect, it } from "vitest";
import { publicContactFormSchema } from "./public-contact-form-schema";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test User",
    email: "test@example.com",
    message: "Butuh kalibrasi alat.",
    topicId: 1,
    captchaToken: "some-token",
    ...overrides,
  };
}

describe("publicContactFormSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(publicContactFormSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("rejects a missing name", () => {
    const { name: _drop, ...payload } = validPayload();
    expect(publicContactFormSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(publicContactFormSchema.safeParse(validPayload({ email: "not-an-email" })).success).toBe(
      false,
    );
  });

  it("rejects a missing topicId — required for the Contact Form", () => {
    const { topicId: _drop, ...payload } = validPayload();
    expect(publicContactFormSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a missing captchaToken", () => {
    const { captchaToken: _drop, ...payload } = validPayload();
    expect(publicContactFormSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a message exceeding the max length", () => {
    expect(
      publicContactFormSchema.safeParse(validPayload({ message: "x".repeat(6000) })).success,
    ).toBe(false);
  });

  it("silently strips getFrom/companyId if a client sends them — never forwarded from client input", () => {
    const result = publicContactFormSchema.safeParse(
      validPayload({ getFrom: "WHATSAPP", companyId: "SOMETHING-ELSE" }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("getFrom");
      expect(result.data).not.toHaveProperty("companyId");
    }
  });
});
