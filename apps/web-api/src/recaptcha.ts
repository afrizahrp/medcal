/**
 * Server-side Google reCAPTCHA v3 verification. Plain fetch to Google's
 * siteverify endpoint — no SDK needed for a single, simple call. A client-
 * reported score/pass boolean is never trusted; the token is always
 * re-verified here, server-side, before the message is forwarded.
 */
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE ?? "0.5");

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

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as SiteVerifyResponse;
  return (
    result.success === true &&
    result.action === expectedAction &&
    typeof result.score === "number" &&
    result.score >= MIN_SCORE
  );
}
