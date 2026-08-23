import { apiFetch } from "@medcal/shared";
import type { Me } from "./me-types";

/** Stable root key for GET /me — session user id is appended at runtime. */
export const ME_QUERY_KEY = ["me"] as const;

/** Query key scoped to the active session user to prevent cross-user cache bleed. */
export function meQueryKey(sessionUserId?: string | null) {
  return sessionUserId ? ([...ME_QUERY_KEY, sessionUserId] as const) : ME_QUERY_KEY;
}

export async function fetchMe(): Promise<Me> {
  return apiFetch<Me>("/me");
}
