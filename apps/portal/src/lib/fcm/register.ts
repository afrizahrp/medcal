import { ApiError, apiFetch } from "@medcal/shared";
import { shouldSkipBackendRegistration } from "./flow";
import {
  clearFcmRegistrationState,
  clearPendingBrowserTokenDelete,
  deleteBrowserFcmToken,
  detectDeviceType,
  getLastRegisteredToken,
  getLastRegisteredTokenId,
  getLastRegisteredUserId,
  markPendingBrowserTokenDelete,
  obtainFcmToken,
  setLastRegisteredToken,
  setLastRegisteredTokenId,
  setLastRegisteredUserId,
} from "./messaging";

export type RegisterPushTokenResult = {
  id: string;
  created: boolean;
  reactivated: boolean;
};

/** Upper bound for each sign-out cleanup step so logout is never held up. */
const SIGN_OUT_CLEANUP_TIMEOUT_MS = 4_000;

/**
 * Register FCM token with the existing authenticated backend.
 * Ownership (userId/companyId) is determined server-side from the session cookie.
 */
export async function registerPushTokenWithBackend(token: string): Promise<RegisterPushTokenResult> {
  return apiFetch<RegisterPushTokenResult>("/notifications/push-tokens", {
    method: "POST",
    body: JSON.stringify({
      token,
      deviceType: detectDeviceType(),
      app: "PORTAL",
    }),
  });
}

/**
 * Best-effort server-side revoke. Never throws; resolves true only when the
 * server confirmed (or the row was already gone).
 */
async function revokePushTokenWithBackend(tokenId: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SIGN_OUT_CLEANUP_TIMEOUT_MS);
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const response = await fetch(`${baseUrl}/notifications/push-tokens/${tokenId}`, {
      method: "DELETE",
      credentials: "include",
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 404) {
      console.error("[fcm] Backend token revoke failed:", response.status, response.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[fcm] Backend token revoke failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function withTimeout(task: Promise<boolean>, fallback: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(fallback), SIGN_OUT_CLEANUP_TIMEOUT_MS);
    task.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      () => {
        clearTimeout(timeoutId);
        resolve(fallback);
      },
    );
  });
}

function isTokenOwnershipConflict(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 409 && error.data?.code === "TOKEN_OWNERSHIP_CONFLICT"
  );
}

function recordRegistration(token: string, result: RegisterPushTokenResult, userId: string) {
  setLastRegisteredToken(token);
  setLastRegisteredTokenId(result.id);
  setLastRegisteredUserId(userId);
}

/**
 * Registration hit TOKEN_OWNERSHIP_CONFLICT: this browser still holds a token
 * that belongs to another user (e.g. their sign-out cleanup failed). Ownership
 * is never transferred. Instead discard the browser's token, mint a fresh one
 * and register that — once.
 */
async function recoverFromOwnershipConflict(
  staleToken: string,
  currentUserId: string,
): Promise<"synced" | "failed"> {
  if (!(await deleteBrowserFcmToken())) return "failed";
  clearPendingBrowserTokenDelete();

  const freshToken = await obtainFcmToken();
  if (!freshToken || freshToken === staleToken) return "failed";

  try {
    const result = await registerPushTokenWithBackend(freshToken);
    recordRegistration(freshToken, result, currentUserId);
    return "synced";
  } catch (error) {
    console.error(
      "[fcm] Backend token registration failed after token reset:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return "failed";
  }
}

/**
 * Obtain-and-register if this authenticated user has not already synced this token.
 */
export async function syncPushTokenIfNeeded(
  token: string,
  currentUserId: string,
): Promise<"synced" | "skipped" | "failed"> {
  if (
    shouldSkipBackendRegistration({
      token,
      lastRegisteredToken: getLastRegisteredToken(),
      lastRegisteredUserId: getLastRegisteredUserId(),
      currentUserId,
    })
  ) {
    return "skipped";
  }

  try {
    const result = await registerPushTokenWithBackend(token);
    recordRegistration(token, result, currentUserId);
    return "synced";
  } catch (error) {
    if (isTokenOwnershipConflict(error)) {
      return recoverFromOwnershipConflict(token, currentUserId);
    }
    console.error(
      "[fcm] Backend token registration failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return "failed";
  }
}

/**
 * Sign-out cleanup: delete this browser's FCM token and revoke the backend
 * record, both best-effort and in parallel. Never throws and is bounded in
 * time, so it can never block sign-out. If the browser token could not be
 * deleted, a persistent marker makes the next sign-in / push registration
 * retry it. Safe to call when push was never enabled.
 */
export async function revokeRegisteredPushToken(): Promise<void> {
  try {
    const tokenId = getLastRegisteredTokenId();
    const [, browserTokenDeleted] = await Promise.all([
      tokenId ? withTimeout(revokePushTokenWithBackend(tokenId), false) : Promise.resolve(true),
      withTimeout(deleteBrowserFcmToken(), false),
    ]);
    if (!browserTokenDeleted) {
      markPendingBrowserTokenDelete();
    }
  } catch (error) {
    markPendingBrowserTokenDelete();
    console.error(
      "[fcm] Sign-out push cleanup failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  } finally {
    clearFcmRegistrationState();
  }
}
