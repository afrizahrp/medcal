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
  lastRegisteredUserId: string | null | undefined;
  currentUserId: string | null | undefined;
}): boolean {
  if (!input.token) return true;
  if (!input.currentUserId) return true;
  if (input.lastRegisteredUserId !== input.currentUserId) return false;
  return input.lastRegisteredToken === input.token;
}
