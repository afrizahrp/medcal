import { apiFetch } from "@medcal/shared";
import { shouldSkipBackendRegistration } from "./flow";
import {
  clearFcmRegistrationState,
  detectDeviceType,
  getLastRegisteredToken,
  getLastRegisteredTokenId,
  getLastRegisteredUserId,
  setLastRegisteredToken,
  setLastRegisteredTokenId,
  setLastRegisteredUserId,
} from "./messaging";

export type RegisterPushTokenResult = {
  id: string;
  created: boolean;
  reactivated: boolean;
};

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
      app: "TECH_PWA",
    }),
  });
}

async function revokePushTokenWithBackend(tokenId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const response = await fetch(`${baseUrl}/notifications/push-tokens/${tokenId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok && response.status !== 404) {
    console.error("[fcm] Backend token revoke failed:", response.status, response.statusText);
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
    setLastRegisteredToken(token);
    setLastRegisteredTokenId(result.id);
    setLastRegisteredUserId(currentUserId);
    return "synced";
  } catch (error) {
    console.error(
      "[fcm] Backend token registration failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return "failed";
  }
}

/**
 * Revoke the backend token registered for this browser session and clear local FCM state.
 */
export async function revokeRegisteredPushToken(): Promise<void> {
  const tokenId = getLastRegisteredTokenId();
  if (tokenId) {
    await revokePushTokenWithBackend(tokenId);
  }
  clearFcmRegistrationState();
}
