"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@medcal/auth/client";
import { sanitizeReturnTo } from "../lib/return-to";

function isPublicAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
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

  return <AuthProvider onNeedsSignIn={onNeedsSignIn}>{children}</AuthProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
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
