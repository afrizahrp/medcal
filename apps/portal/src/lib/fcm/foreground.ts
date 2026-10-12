import type { MessagePayload } from "firebase/messaging";

/**
 * Foreground (page is visible) push handling. Pure helpers live here so they
 * can be unit-tested without a browser; the wiring is in
 * push-notifications-provider.tsx.
 */
const KNOWN_TYPES = new Set(["CONTACT_MESSAGE_NEW", "LEAD_ASSIGNED"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const DEFAULT_TITLE = "MedCal";
const DEFAULT_BODY = "Buka untuk melihat detailnya.";

export interface ForegroundNotification {
  title: string;
  options: NotificationOptions;
}

/**
 * Build the OS notification to show for a foreground message, or null when the
 * message is not one of ours. Only the generic title/body the server sent and
 * the whitelisted routing keys (`type`, `leadId`) are carried over — nothing
 * else from the payload is trusted or forwarded to the service worker.
 */
export function buildForegroundNotification(
  payload: Pick<MessagePayload, "notification" | "data">,
  defaultIcon = "/short-logo.png",
): ForegroundNotification | null {
  const type = payload.data?.type;
  if (!type || !KNOWN_TYPES.has(type)) return null;

  const rawLeadId = payload.data?.leadId;
  const leadId = rawLeadId && SAFE_ID.test(rawLeadId) ? rawLeadId : "";

  return {
    title: payload.notification?.title || DEFAULT_TITLE,
    options: {
      body: payload.notification?.body || DEFAULT_BODY,
      icon: defaultIcon,
      badge: defaultIcon,
      // Same type+lead replaces the previous toast instead of stacking duplicates.
      tag: `${type}:${leadId}`,
      data: { type, leadId },
    },
  };
}
