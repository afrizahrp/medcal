"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@medcal/auth/client";
import { TechPwaSymbolPicker } from "../components/global-symbol-picker-host";
import { SwRegister } from "../components/layout/sw-register";

function isPublicAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

function TechPwaAuthProvider({ children }: { children: React.ReactNode }) {
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
      <SwRegister />
      <TechPwaAuthProvider>
        {children}
        <TechPwaSymbolPicker />
      </TechPwaAuthProvider>
    </QueryClientProvider>
  );
}
