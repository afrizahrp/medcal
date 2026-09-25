/**
 * Restricts a `returnTo` deep-link destination to a same-app internal path.
 * Used both when building the `/sign-in?returnTo=...` redirect (auth-provider
 * onNeedsSignIn) and when consuming it after a successful sign-in/sign-up.
 *
 * Must never allow an open redirect: reject anything that isn't a plain
 * internal path starting with exactly one `/` — no absolute URLs, no
 * protocol-relative ("//host"), no backslash tricks ("/\host", which some
 * browsers/parsers treat as protocol-relative too), no embedded scheme.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // A safe internal path never needs "://" — this blocks anything that
  // smuggled a scheme in behind the leading "/" (e.g. odd encodings).
  if (raw.includes("://")) return "/";
  return raw;
}
