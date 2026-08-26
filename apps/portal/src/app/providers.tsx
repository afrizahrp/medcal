"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@medcal/auth/client";
import { PortalSymbolPicker } from "../components/global/portal-symbol-picker";

function isPublicAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const onNeedsSignIn = useCallback(() => {
    if (!isPublicAuthRoute(pathnameRef.current)) {
      router.replace("/sign-in");
    }
  }, [router]);

  return <AuthProvider onNeedsSignIn={onNeedsSignIn}>{children}</AuthProvider>;
}

/**
 * Single application-level provider tree root (Management List canonical
 * pattern, 2026-08-18) — apps/portal/src/app/layout.tsx had zero providers
 * before this. `useState(() => new QueryClient(...))` (not a module-level
 * singleton) so each request/mount gets its own client, matching Next.js App
 * Router's guidance for client-side providers in a server-rendered tree.
 *
 * staleTime is short (15s) relative to easy-app's 60s sales-invoice
 * reference — contact messages/leads change more frequently (new inbound
 * messages, status updates) than sales invoices.
 */
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
      <PortalAuthProvider>
        {children}
        <PortalSymbolPicker />
      </PortalAuthProvider>
    </QueryClientProvider>
  );
}
