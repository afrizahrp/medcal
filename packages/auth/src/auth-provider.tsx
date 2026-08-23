"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@medcal/shared";
import { useSession } from "./auth-client";
import { fetchMe, meQueryKey } from "./me-query";
import type {
  AuthBootstrapStatus,
  Me,
  MeCapabilities,
  MeMembership,
  MeUser,
} from "./me-types";

export type { Me, MeCapabilities, MeMembership, MeUser, AuthBootstrapStatus };

type AuthContextValue = {
  bootstrapStatus: AuthBootstrapStatus;
  user: MeUser | null;
  membership: MeMembership | null;
  capabilities: MeCapabilities | null;
  me: Me | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthProviderProps = {
  children: ReactNode;
  /**
   * Called when Better Auth reports no session (after pending resolves) or
   * GET /me returns 401. Omit on public routes (e.g. sign-in) to skip redirect.
   */
  onNeedsSignIn?: () => void;
};

function deriveBootstrapStatus(
  sessionPending: boolean,
  hasSession: boolean,
  mePending: boolean,
  meError: unknown,
  hasMeData: boolean,
): AuthBootstrapStatus {
  if (sessionPending) return "loading";
  if (!hasSession) return "loading";
  if (mePending) return "loading";
  if (meError) {
    if (meError instanceof ApiError && meError.data?.code === "ACCOUNT_PENDING") {
      return "pending";
    }
    if (meError instanceof ApiError && meError.status === 401) {
      return "loading";
    }
    return "forbidden";
  }
  if (hasMeData) return "ready";
  return "loading";
}

/**
 * Global auth bootstrap — GET /me via TanStack Query, shared across the tree.
 * UX/navigation only; apps/api CompanyRoleGuard remains the enforcement boundary.
 */
export function AuthProvider({ children, onNeedsSignIn }: AuthProviderProps) {
  const { data: session, isPending: sessionPending } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  const onNeedsSignInRef = useRef(onNeedsSignIn);
  onNeedsSignInRef.current = onNeedsSignIn;

  const meQuery = useQuery({
    queryKey: meQueryKey(sessionUserId),
    queryFn: fetchMe,
    enabled: !sessionPending && sessionUserId != null,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) return false;
        if (error.data?.code === "ACCOUNT_PENDING") return false;
      }
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if (sessionPending) return;

    if (!session) {
      onNeedsSignInRef.current?.();
      return;
    }

    if (
      meQuery.isError &&
      meQuery.error instanceof ApiError &&
      meQuery.error.status === 401
    ) {
      onNeedsSignInRef.current?.();
    }
  }, [sessionPending, session, meQuery.isError, meQuery.error]);

  const hasSession = session != null;
  const bootstrapStatus = deriveBootstrapStatus(
    sessionPending,
    hasSession,
    hasSession && meQuery.isPending,
    meQuery.error,
    hasSession && meQuery.data != null,
  );

  const user: MeUser | null = hasSession && meQuery.data ? meQuery.data.user : null;
  const membership: MeMembership | null =
    hasSession && meQuery.data ? meQuery.data.membership : null;
  const capabilities: MeCapabilities | null =
    hasSession && meQuery.data ? meQuery.data.capabilities : null;

  const me = useMemo((): Me | null => {
    if (!user || !membership || !capabilities) return null;
    return { user, membership, capabilities };
  }, [user, membership, capabilities]);

  const isAuthenticated = bootstrapStatus === "ready" && hasSession;
  const isAuthLoading = sessionPending || bootstrapStatus === "loading";

  const value = useMemo(
    (): AuthContextValue => ({
      bootstrapStatus,
      user,
      membership,
      capabilities,
      me,
      isAuthenticated,
      isAuthLoading,
    }),
    [bootstrapStatus, user, membership, capabilities, me, isAuthenticated, isAuthLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("Auth hooks must be used within AuthProvider");
  }
  return ctx;
}

/** Auth slice — bootstrap status and current user. */
export function useAuth() {
  const { bootstrapStatus, user, isAuthenticated, isAuthLoading } = useAuthContext();
  return { bootstrapStatus, user, isAuthenticated, isAuthLoading };
}

/** Authz slice — membership and server-computed capability booleans. */
export function useAuthz() {
  const { membership, capabilities } = useAuthContext();
  return { membership, capabilities };
}

/** Combined me payload + bootstrap status (same shape as legacy useRequireSession). */
export function useMe() {
  const { me, bootstrapStatus } = useAuthContext();
  return { me, status: bootstrapStatus };
}

/**
 * Reads global auth state — does not fetch. Safe to call from any descendant
 * of AuthProvider without duplicating GET /me.
 */
export function useRequireSession(): { me: Me | null; status: AuthBootstrapStatus } {
  const { me, bootstrapStatus } = useAuthContext();
  return { me, status: bootstrapStatus };
}
