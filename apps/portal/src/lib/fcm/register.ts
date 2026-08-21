import { apiFetch } from "@medcal/shared";
import { shouldSkipBackendRegistration } from "./flow";
import { detectDeviceType, getLastRegisteredToken, setLastRegisteredToken } from "./messaging";

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
      app: "PORTAL",
    }),
  });
}

/**
 * Obtain-and-register if this session has not already registered the same token.
 * Avoids registration loops on re-render.
 */
export async function syncPushTokenIfNeeded(token: string): Promise<"synced" | "skipped" | "failed"> {
  if (
    shouldSkipBackendRegistration({
      token,
      lastRegisteredToken: getLastRegisteredToken(),
    })
  ) {
    return "skipped";
  }

  try {
    await registerPushTokenWithBackend(token);
    setLastRegisteredToken(token);
    return "synced";
  } catch (error) {
    console.error(
      "[fcm] Backend token registration failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return "failed";
  }
}
