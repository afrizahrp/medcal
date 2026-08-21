import type { NotificationPermissionState } from "./permission";

/**
 * Pure decision helpers for FCM registration flow (unit-testable, no browser APIs).
 */

export function shouldRequestPermission(state: NotificationPermissionState): boolean {
  return state === "default";
}

export function shouldObtainAndRegisterToken(input: {
  permission: NotificationPermissionState;
  authenticated: boolean;
}): boolean {
  return input.authenticated && input.permission === "granted";
}

export function shouldSkipBackendRegistration(input: {
  token: string | null | undefined;
  lastRegisteredToken: string | null | undefined;
}): boolean {
  if (!input.token) return true;
  return input.lastRegisteredToken === input.token;
}
