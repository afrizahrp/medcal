import type { QueryClient } from "@tanstack/react-query";
import { ME_QUERY_KEY } from "./me-query";

export type NavApplication = "MANAGEMENT" | "TECHNICIAN" | "CUSTOMER";

/** Invalidate all cached /me payloads (any session user). */
export function invalidateMeQuery(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY] });
}

/** Invalidate permission-filtered nav for one application or all applications. */
export function invalidateNavQuery(queryClient: QueryClient, application?: NavApplication) {
  if (application) {
    return queryClient.invalidateQueries({ queryKey: ["nav", application] });
  }
  return queryClient.invalidateQueries({ queryKey: ["nav"] });
}

/**
 * Invalidate auth server state and optionally nav after membership/permission changes.
 * Call from mutation success handlers — not from AuthProvider.
 */
export async function invalidateAuthQueries(
  queryClient: QueryClient,
  options?: { navApplication?: NavApplication; allNav?: boolean },
) {
  await invalidateMeQuery(queryClient);
  if (options?.allNav) {
    await invalidateNavQuery(queryClient);
  } else if (options?.navApplication) {
    await invalidateNavQuery(queryClient, options.navApplication);
  }
}
