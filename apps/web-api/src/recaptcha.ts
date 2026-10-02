/**
 * Server-side Google reCAPTCHA v3 verification. Plain fetch to Google's
 * siteverify endpoint — no SDK needed for a single, simple call. A client-
 * reported score/pass boolean is never trusted; the token is always
 * re-verified here, server-side, before the message is forwarded.
 */
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE ?? "0.5");

const VERIFY_TIMEOUT_MS = 5000;

/**
 * Thrown when the verification REQUEST itself failed (network error, timeout,
 * unreadable response) — distinct from Google rejecting the token, which
 * `verifyRecaptcha` reports as `false`. Never treated as a pass.
 */
export class RecaptchaUnavailableError extends Error {
  constructor(cause: unknown) {
    super("reCAPTCHA verification request failed");
    this.name = "RecaptchaUnavailableError";
    this.cause = cause;
  }
}

interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

export async function verifyRecaptcha(token: string, expectedAction: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    // Fail closed: an unconfigured secret must never be treated as "verification skipped."
    return false;
  }

  let result: SiteVerifyResponse;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      return false;
    }

    result = (await response.json()) as SiteVerifyResponse;
  } catch (err) {
    throw new RecaptchaUnavailableError(err);
  }
  return (
    result.success === true &&
    result.action === expectedAction &&
    typeof result.score === "number" &&
    result.score >= MIN_SCORE
  );
}
