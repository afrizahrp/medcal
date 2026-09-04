"use client";

import { useEffect } from "react";

const SW_PATH = "/firebase-messaging-sw.js";

/**
 * Always-on service worker registration (app-shell offline fallback + FCM
 * background handler share one SW — only one is allowed per scope). Mounted
 * once at the app root, independent of push-notification opt-in.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_PATH, { scope: "/" }).catch((error) => {
      console.error("[sw] registration failed:", error instanceof Error ? error.message : error);
    });
  }, []);

  return null;
}
