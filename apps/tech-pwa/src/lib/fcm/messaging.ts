/**
 * Browser-only Firebase Messaging helpers for Tech-PWA FCM registration.
 * Do not import this module from Server Components.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";
import { getFirebaseWebConfig, getFirebaseVapidKey } from "./config";
import { getNotificationPermissionState } from "./permission";

const SW_PATH = "/firebase-messaging-sw.js";
const LAST_TOKEN_KEY = "medcal:tech-pwa:fcm:lastRegisteredToken";
const LAST_TOKEN_ID_KEY = "medcal:tech-pwa:fcm:lastRegisteredTokenId";
const LAST_USER_ID_KEY = "medcal:tech-pwa:fcm:lastRegisteredUserId";
// Persistent (localStorage): survives tab/browser restarts, unlike the keys above.
const PENDING_TOKEN_DELETE_KEY = "medcal:tech-pwa:fcm:pendingBrowserTokenDelete";

let messagingInstance: Messaging | null = null;

export type FcmTokenErrorKind = "permission-blocked" | "stale-subscription" | "subscription-failed";

let lastFcmTokenErrorKind: FcmTokenErrorKind | null = null;

export function getLastFcmTokenErrorKind(): FcmTokenErrorKind | null {
  return lastFcmTokenErrorKind;
}

function classifyFcmTokenError(error: unknown): FcmTokenErrorKind {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "permission-blocked";
    if (error.name === "InvalidStateError") return "stale-subscription";
  }
  return "subscription-failed";
}

function getOrInitApp(): FirebaseApp | null {
  const config = getFirebaseWebConfig();
  if (!config) return null;
  const existing = getApps()[0];
  return existing ?? initializeApp(config);
}

export async function isMessagingSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!(await isMessagingSupported())) return null;

  const app = getOrInitApp();
  if (!app) return null;

  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

/**
 * <SwRegister/> (mounted app-wide in providers.tsx) already registers this SW
 * on app start — this just waits for that registration instead of registering
 * a second time.
 */
export async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.getRegistration(SW_PATH) ?? navigator.serviceWorker.ready;
  } catch (error) {
    console.error(
      "[fcm] Service worker registration lookup failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

export function detectDeviceType(): string {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "edge"
    : /Chrome\//.test(ua)
      ? "chrome"
      : /Firefox\//.test(ua)
        ? "firefox"
        : /Safari\//.test(ua)
          ? "safari"
          : "browser";
  const os = /Windows/.test(ua)
    ? "windows"
    : /Mac OS/.test(ua)
      ? "macos"
      : /Android/.test(ua)
        ? "android"
        : /iPhone|iPad|iPod/.test(ua)
          ? "ios"
          : /Linux/.test(ua)
            ? "linux"
            : "unknown";
  return `${browser}/${os}`;
}

export function hasPendingBrowserTokenDelete(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(PENDING_TOKEN_DELETE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPendingBrowserTokenDelete(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PENDING_TOKEN_DELETE_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

export function clearPendingBrowserTokenDelete(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PENDING_TOKEN_DELETE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Delete this browser's FCM token (invalidates it at FCM and unsubscribes push).
 * Never throws. Resolves true when the browser holds no usable token afterwards
 * (including "nothing to delete"), false when deletion was attempted and failed.
 *
 * getToken() runs first only to bind the SDK to our service-worker registration:
 * after a page reload deleteToken() would otherwise register a second default
 * worker and unsubscribe the wrong (empty) registration.
 */
export async function deleteBrowserFcmToken(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return true;
    // A token can only exist after permission was granted.
    if (getNotificationPermissionState() !== "granted") return true;
    const vapidKey = getFirebaseVapidKey();
    const messaging = await getFirebaseMessaging();
    if (!vapidKey || !messaging) return true;

    const registration = await registerMessagingServiceWorker();
    if (!registration) return false;

    await navigator.serviceWorker.ready;
    await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    await deleteToken(messaging);
    return true;
  } catch (error) {
    console.error(
      "[fcm] Browser token deletion failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  }
}

/**
 * Retry a browser-token deletion that failed during sign-out.
 * Safe to call at any time and when nothing is pending.
 */
export async function recoverPendingBrowserTokenDelete(): Promise<void> {
  if (!hasPendingBrowserTokenDelete()) return;
  if (await deleteBrowserFcmToken()) {
    clearPendingBrowserTokenDelete();
  }
}

export async function obtainFcmToken(): Promise<string | null> {
  lastFcmTokenErrorKind = null;
  const vapidKey = getFirebaseVapidKey();
  if (!vapidKey) {
    console.error("[fcm] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured");
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  // A previous sign-out could not delete this browser's token: finish that
  // first so a different user never inherits the old user's token.
  await recoverPendingBrowserTokenDelete();

  const registration = await registerMessagingServiceWorker();
  if (!registration) return null;

  try {
    await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      console.error("[fcm] getToken() returned empty token");
      return null;
    }
    return token;
  } catch (error) {
    lastFcmTokenErrorKind = classifyFcmTokenError(error);
    console.error(
      "[fcm] getToken() failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

export function getLastRegisteredToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(LAST_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setLastRegisteredToken(token: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(LAST_TOKEN_KEY, token);
  } catch {
    // ignore quota / private mode
  }
}

export function getLastRegisteredTokenId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(LAST_TOKEN_ID_KEY);
  } catch {
    return null;
  }
}

export function setLastRegisteredTokenId(tokenId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(LAST_TOKEN_ID_KEY, tokenId);
  } catch {
    // ignore quota / private mode
  }
}

export function getLastRegisteredUserId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(LAST_USER_ID_KEY);
  } catch {
    return null;
  }
}

export function setLastRegisteredUserId(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(LAST_USER_ID_KEY, userId);
  } catch {
    // ignore quota / private mode
  }
}

export function clearFcmRegistrationState(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(LAST_TOKEN_KEY);
    sessionStorage.removeItem(LAST_TOKEN_ID_KEY);
    sessionStorage.removeItem(LAST_USER_ID_KEY);
  } catch {
    // ignore quota / private mode
  }
}
