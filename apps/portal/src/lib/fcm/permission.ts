export type NotificationPermissionState = "unsupported" | "default" | "granted" | "denied";

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Request browser notification permission.
 * Does not re-prompt after an explicit denial.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = getNotificationPermissionState();
  if (current === "unsupported" || current === "denied" || current === "granted") {
    return current;
  }

  const result = await Notification.requestPermission();
  if (result === "granted" || result === "denied" || result === "default") {
    return result;
  }
  return "default";
}
