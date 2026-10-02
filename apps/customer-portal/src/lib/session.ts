"use client";

import { signOut, useSession } from "@medcal/auth/client";

/** The signed-in user's id, or null when signed out. undefined while the session is still loading. */
export function useSessionUserId(): string | null | undefined {
  const { data, isPending } = useSession();
  if (isPending) return undefined;
  return data?.user?.id ?? null;
}

let expiring: Promise<void> | null = null;

/**
 * The server said 401: the cookie is no longer a valid session. Signing out
 * clears the client's session state, which AuthProvider already turns into a
 * redirect to /sign-in?returnTo=<current page>. Without this the sign-in page
 * would still see a (stale) session and bounce straight back. A 403 is an
 * authorization answer, not an expired session, and never comes through here.
 * Concurrent 401s from several queries share one sign-out.
 */
export function expireSession(): Promise<void> {
  if (!expiring) {
    expiring = signOut()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        expiring = null;
      });
  }
  return expiring;
}
