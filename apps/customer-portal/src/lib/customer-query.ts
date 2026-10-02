import { ApiError } from "@medcal/shared";

/**
 * Every query that holds a signed-in customer's data lives under this root and
 * carries the session's user id, so one customer's cached result can never be
 * served to another (see customerQueryKey and SessionCacheBoundary).
 */
export const CUSTOMER_QUERY_ROOT = "customer-portal" as const;

export function customerQueryKey(userId: string | null | undefined, ...parts: unknown[]) {
  return [CUSTOMER_QUERY_ROOT, userId ?? null, ...parts] as const;
}

/** A 4xx will not fix itself, so it is not retried; anything else gets one quick retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export const RETRY_DELAY_MS = 600;

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
