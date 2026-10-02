import { RecaptchaUnavailableError, verifyRecaptcha } from "./recaptcha";

export type CaptchaGateResult =
  | { ok: true }
  | { ok: false; status: 400 | 503; error: string };

/**
 * Maps reCAPTCHA verification to an HTTP outcome for the public routes:
 * rejected token -> 400 (unchanged), verification request failed -> 503.
 * Never resolves `ok: true` unless Google actually accepted the token, and
 * never throws (an async Express 4 handler would turn that into an
 * unhandled rejection).
 */
export async function checkCaptcha(token: string, expectedAction: string): Promise<CaptchaGateResult> {
  try {
    const verified = await verifyRecaptcha(token, expectedAction);
    if (verified) {
      return { ok: true };
    }
    return { ok: false, status: 400, error: "CAPTCHA verification failed" };
  } catch (err) {
    if (err instanceof RecaptchaUnavailableError) {
      console.error(`[web-api] reCAPTCHA verification unavailable (action=${expectedAction}):`, err.cause);
      return { ok: false, status: 503, error: "CAPTCHA verification unavailable, please try again shortly" };
    }
    throw err;
  }
}
