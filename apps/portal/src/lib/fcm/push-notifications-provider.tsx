"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useAuth } from "@medcal/auth/client";
import { notifyContactMessagesChanged } from "../contact-messages-sync";
import { buildForegroundNotification } from "./foreground";
import { subscribeToForegroundMessages } from "./messaging";
import { usePushNotifications, type PushNotificationStatus } from "./use-push-notifications";

interface PushNotificationsState {
  status: PushNotificationStatus;
  errorMessage: string | null;
  enable: () => Promise<void>;
}

const PushNotificationsContext = createContext<PushNotificationsState | null>(null);

async function showForegroundNotification(
  payload: Parameters<typeof buildForegroundNotification>[0],
): Promise<void> {
  const notification = buildForegroundNotification(payload);
  if (!notification) return;

  // Same generic notification as a background push; the service worker's click
  // handler routes it. Counters/lists refresh through the existing bus.
  notifyContactMessagesChanged();

  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  await registration?.showNotification(notification.title, notification.options);
}

/**
 * Owns push state for the whole management area: token synchronisation runs
 * once when the area mounts (not when the account dropdown opens), the
 * permission prompt still only happens from `enable()` (an explicit click),
 * and exactly one foreground listener is attached while push is enabled.
 */
export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { status, errorMessage, enable } = usePushNotifications({
    authenticated: isAuthenticated,
    userId: user?.id,
  });
  const enabled = status === "enabled";

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void subscribeToForegroundMessages((payload) => {
      void showForegroundNotification(payload).catch((error) => {
        console.error(
          "[fcm] Foreground notification failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
      });
    }).then((stop) => {
      if (cancelled) {
        stop();
      } else {
        unsubscribe = stop;
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled]);

  const value = useMemo(() => ({ status, errorMessage, enable }), [status, errorMessage, enable]);

  return <PushNotificationsContext.Provider value={value}>{children}</PushNotificationsContext.Provider>;
}

export function usePushNotificationsState(): PushNotificationsState {
  const value = useContext(PushNotificationsContext);
  if (!value) {
    throw new Error("usePushNotificationsState must be used inside <PushNotificationsProvider>");
  }
  return value;
}
