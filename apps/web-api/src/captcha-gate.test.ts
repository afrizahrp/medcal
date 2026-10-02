import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCaptcha } from "./captcha-gate";

const originalSecret = process.env.RECAPTCHA_SECRET_KEY;

describe("checkCaptcha", () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
    else process.env.RECAPTCHA_SECRET_KEY = originalSecret;
  });

  it("passes when Google accepts the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, action: "contact_submit", score: 0.9 }),
      }),
    );
    await expect(checkCaptcha("token", "contact_submit")).resolves.toEqual({ ok: true });
  });

  it("Case C: rejected verification -> 400, not a pass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      }),
    );
    await expect(checkCaptcha("token", "contact_submit")).resolves.toEqual({
      ok: false,
      status: 400,
      error: "CAPTCHA verification failed",
    });
    await new Promise((r) => setImmediate(r));
    expect(unhandled).toEqual([]);
  });

  it("Case D: network failure -> controlled 503, never ok, no unhandled rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await checkCaptcha("token", "contact_submit");
    expect(result).toMatchObject({ ok: false, status: 503 });
    await new Promise((r) => setImmediate(r));
    expect(unhandled).toEqual([]);
  });

  it("Case D: unreadable response body from Google -> controlled 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    );
    await expect(checkCaptcha("token", "contact_submit")).resolves.toMatchObject({ ok: false, status: 503 });
  });

  it("Case D: verification timeout (abort) -> controlled 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(checkCaptcha("token", "contact_submit")).resolves.toMatchObject({ ok: false, status: 503 });
  });

  it("missing secret still fails closed as a rejection (400), not as unavailable", async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    await expect(checkCaptcha("token", "contact_submit")).resolves.toMatchObject({ ok: false, status: 400 });
  });
});
