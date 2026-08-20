"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@medcal/auth/client";
import { ApiError, apiFetch } from "@medcal/shared";
import type { MembershipRole } from "@medcal/shared";

export interface Me {
  user: { id: string; email: string; name: string };
  membership: { role: MembershipRole; companyId: string };
  /** Minimal capability signal for non-menu UI surfaces — see MeController. */
  capabilities: {
    leadRead: boolean;
    chatRead: boolean;
    emailRead: boolean;
    emailSend: boolean;
    emailDelete: boolean;
    emailManage: boolean;
  };
}

export type SessionStatus = "loading" | "ready" | "forbidden" | "pending";

/**
 * Client-side session check. Session cookies in dev are host-scoped
 * (COOKIE_DOMAIN="") to apps/api's own origin, not shared with apps/portal's
 * origin — an SSR layout can never see them cross-origin. Browser fetches
 * made TO apps/api (credentials:"include", CORS via TRUSTED_ORIGINS) do
 * carry the cookie regardless of origin, so the check happens client-side.
 * This is a UX/navigation check only — apps/api's CompanyRoleGuard remains
 * the real enforcement boundary on every business call.
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
        // ACCOUNT_PENDING = registered but not yet provisioned (G1/G5) —
        // distinct from a real permission denial, which stays "forbidden".
        if (error instanceof ApiError && error.data?.code === "ACCOUNT_PENDING") {
          setStatus("pending");
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
