"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { QueryCache, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@medcal/auth/client";
import { sanitizeReturnTo } from "../lib/return-to";
import {
  CUSTOMER_QUERY_ROOT,
  RETRY_DELAY_MS,
  isUnauthorizedError,
  shouldRetry,
} from "../lib/customer-query";
import { expireSession, useSessionUserId } from "../lib/session";

function isPublicAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

/**
 * Session-change housekeeping.
 *
 * 1. Drops every cached customer result when the signed-in user changes —
 *    including to "signed out" — so the next account never sees the previous
 *    one's data, even for a moment. The query keys are user-scoped as well; this
 *    is the cleanup, that is the guarantee. Only customer data is removed; the
 *    auth package's own /me query is already keyed by user.
 * 2. Sends a signed-out visitor to sign-in whenever they land on a protected
 *    page. AuthProvider only redirects when the session *changes*; pressing
 *    Back to a protected page after signing out is a client-side navigation
 *    with no such change, which would otherwise leave the gate on "Memuat…"
 *    for good. `onNeedsSignIn` ignores the public sign-in routes.
 */
function SessionBoundary({ onNeedsSignIn }: { onNeedsSignIn: () => void }) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const userId = useSessionUserId();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (userId === null) onNeedsSignIn();
  }, [userId, pathname, onNeedsSignIn]);

  useEffect(() => {
    if (userId === undefined) return;
    if (previous.current !== undefined && previous.current !== userId) {
      queryClient.removeQueries({ queryKey: [CUSTOMER_QUERY_ROOT] });
    }
    previous.current = userId;
  }, [userId, queryClient]);

  return null;
}

function CustomerPortalAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Preserves the original destination (e.g. a QR certificate deep link)
  // through the sign-in/sign-up round trip. Reads window.location directly
  // (rather than useSearchParams) so this provider never needs a Suspense
  // boundary — this callback only ever runs client-side anyway.
  const onNeedsSignIn = useCallback(() => {
    const currentPathname = pathnameRef.current;
    if (isPublicAuthRoute(currentPathname)) return;
    const search = typeof window !== "undefined" ? window.location.search : "";
    const destination = sanitizeReturnTo(`${currentPathname ?? "/"}${search}`);
    router.replace(`/sign-in?returnTo=${encodeURIComponent(destination)}`);
  }, [router]);

  return (
    <AuthProvider onNeedsSignIn={onNeedsSignIn}>
      <SessionBoundary onNeedsSignIn={onNeedsSignIn} />
      {children}
    </AuthProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // A 401 from any query means the session is gone: end it, and the auth
        // provider redirects to sign-in with a safe returnTo. A 403 is a
        // different answer (not allowed) and is left to the page to explain.
        queryCache: new QueryCache({
          onError: (error) => {
            if (isUnauthorizedError(error)) void expireSession();
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: shouldRetry,
            retryDelay: RETRY_DELAY_MS,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <CustomerPortalAuthProvider>{children}</CustomerPortalAuthProvider>
    </QueryClientProvider>
  );
}
