/**
 * Better Auth React client — browser-safe only. Never import "@medcal/auth"
 * (the root export) from a client component: it pulls in @medcal/db/Prisma.
 * Import "@medcal/auth/client" instead.
 */
export { authClient, signIn, signOut, useSession } from "./auth-client";

export {
  AuthProvider,
  useAuth,
  useAuthz,
  useMe,
  useRequireSession,
  type AuthProviderProps,
} from "./auth-provider";
export { ME_QUERY_KEY, meQueryKey, fetchMe } from "./me-query";
export {
  invalidateAuthQueries,
  invalidateMeQuery,
  invalidateNavQuery,
  type NavApplication,
} from "./auth-invalidation";
export type {
  Me,
  MeCapabilities,
  MeMembership,
  MeUser,
  AuthBootstrapStatus,
} from "./me-types";
