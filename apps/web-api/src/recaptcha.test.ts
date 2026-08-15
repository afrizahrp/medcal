import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRecaptcha } from "./recaptcha";

const originalSecret = process.env.RECAPTCHA_SECRET_KEY;
const originalMinScore = process.env.RECAPTCHA_MIN_SCORE;

function mockFetchOnce(response: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: async () => response,
    }),
  );
}

describe("verifyRecaptcha", () => {
  beforeEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    process.env.RECAPTCHA_MIN_SCORE = "0.5";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.RECAPTCHA_SECRET_KEY = originalSecret;
    process.env.RECAPTCHA_MIN_SCORE = originalMinScore;
  });

  it("fails closed when RECAPTCHA_SECRET_KEY is not configured — never treats missing config as skip", async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    mockFetchOnce({ success: true, action: "contact_submit", score: 0.9 });
    await expect(verifyRecaptcha("token", "contact_submit")).resolves.toBe(false);
  });

  it("accepts a token when Google reports success, matching action, and score above threshold", async () => {
    mockFetchOnce({ success: true, action: "contact_submit", score: 0.9 });
    await expect(verifyRecaptcha("token", "contact_submit")).resolves.toBe(true);
  });

  it("rejects when Google reports success but a mismatched action", async () => {
    mockFetchOnce({ success: true, action: "some_other_action", score: 0.9 });
    await expect(verifyRecaptcha("token", "contact_submit")).resolves.toBe(false);
  });

  it("rejects when the score is below the configured minimum", async () => {
    mockFetchOnce({ success: true, action: "contact_submit", score: 0.1 });
    await expect(verifyRecaptcha("token", "contact_submit")).resolves.toBe(false);
  });

  it("rejects when Google reports success: false", async () => {
    mockFetchOnce({ success: false, "error-codes": ["invalid-input-response"] });
    await expect(verifyRecaptcha("token", "contact_submit")).resolves.toBe(false);
  });

  it("rejects when the HTTP call to Google itself fails", async () => {
    mockFetchOnce({}, false);
    await expect(verifyRecaptcha("token", "contact_submit")).resolves.toBe(false);
  });
});
