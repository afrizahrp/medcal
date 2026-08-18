"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
