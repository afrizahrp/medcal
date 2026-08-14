"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@medcal/auth/client";
import { ApiError, apiFetch } from "@medcal/shared";
import type { MembershipRole } from "@medcal/shared";

export interface Me {
  user: { id: string; email: string; name: string };
  membership: { role: MembershipRole; companyId: string };
}

export type SessionStatus = "loading" | "ready" | "forbidden";

/**
 * Client-side session check — same pattern as apps/portal. Session cookies
 * in dev are host-scoped to apps/api's own origin, not shared with
 * apps/tech-pwa's origin, so this must run client-side (browser fetch with
 * credentials:"include" carries the cookie regardless of origin via CORS).
 * UX/navigation only — apps/api's CompanyRoleGuard remains the real
 * enforcement boundary on every business call.
 */
export function useRequireSession(): { me: Me | null; status: SessionStatus } {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }

    let cancelled = false;
    apiFetch<Me>("/me")
      .then((data) => {
        if (!cancelled) {
          setMe(data);
          setStatus("ready");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/sign-in");
          return;
        }
        setStatus("forbidden");
      });

    return () => {
      cancelled = true;
    };
  }, [isPending, session, router]);

  return { me, status };
}
