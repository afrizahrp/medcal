/**
 * Browser-only Firebase Messaging helpers for Portal FCM registration.
 * Do not import this module from Server Components.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";
import { getFirebaseWebConfig, getFirebaseVapidKey } from "./config";

const SW_PATH = "/firebase-messaging-sw.js";
const LAST_TOKEN_KEY = "medcal:portal:fcm:lastRegisteredToken";

let messagingInstance: Messaging | null = null;

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

export async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  } catch (error) {
    console.error(
      "[fcm] Service worker registration failed:",
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

export async function obtainFcmToken(): Promise<string | null> {
  const vapidKey = getFirebaseVapidKey();
  if (!vapidKey) {
    console.error("[fcm] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured");
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

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
