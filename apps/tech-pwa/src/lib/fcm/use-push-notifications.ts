"use client";

import { useCallback, useEffect, useState } from "react";
import { isFirebaseWebConfigured } from "./config";
import { getNotificationPermissionState, requestNotificationPermission } from "./permission";
import { isMessagingSupported, obtainFcmToken } from "./messaging";
import { syncPushTokenIfNeeded } from "./register";

export type PushNotificationStatus =
  | "idle"
  | "unsupported"
  | "unconfigured"
  | "default"
  | "denied"
  | "enabling"
  | "enabled"
  | "error";

/**
 * Tech-PWA push notification registration.
 * Requires an authenticated ACTIVE session (caller must only enable when /me is ready).
 * Does not auto-prompt on mount — user must call enable().
 */
export function usePushNotifications(options: { authenticated: boolean; userId?: string | null }) {
  const { authenticated, userId } = options;
  const [status, setStatus] = useState<PushNotificationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!isFirebaseWebConfigured()) {
        if (!cancelled) setStatus("unconfigured");
        return;
      }
      if (!(await isMessagingSupported())) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      const permission = getNotificationPermissionState();
      if (permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      if (permission === "granted" && authenticated && userId) {
        if (!cancelled) setStatus("enabling");
        const token = await obtainFcmToken();
        if (!token) {
          if (!cancelled) {
            setStatus("error");
            setErrorMessage("Could not obtain FCM token");
          }
          return;
        }
        const result = await syncPushTokenIfNeeded(token, userId);
        if (!cancelled) {
          if (result === "failed") {
            setStatus("error");
            setErrorMessage("Token registration failed");
          } else {
            setStatus("enabled");
            setErrorMessage(null);
          }
        }
        return;
      }

      if (!cancelled) {
        setStatus("default");
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [authenticated, userId]);

  const enable = useCallback(async () => {
    if (!authenticated || !userId) {
      setStatus("error");
      setErrorMessage("Sign in required");
      return;
    }
    if (!isFirebaseWebConfigured()) {
      setStatus("unconfigured");
      return;
    }
    if (!(await isMessagingSupported())) {
      setStatus("unsupported");
      return;
    }

    setStatus("enabling");
    setErrorMessage(null);

    const permission = await requestNotificationPermission();
    if (permission === "denied") {
      setStatus("denied");
      return;
    }
    if (permission !== "granted") {
      setStatus("default");
      return;
    }

    const token = await obtainFcmToken();
    if (!token) {
      setStatus("error");
      setErrorMessage("Could not obtain FCM token");
      return;
    }

    const result = await syncPushTokenIfNeeded(token, userId);
    if (result === "failed") {
      setStatus("error");
      setErrorMessage("Token registration failed");
      return;
    }

    setStatus("enabled");
    setErrorMessage(null);
  }, [authenticated, userId]);

  return { status, errorMessage, enable };
}
