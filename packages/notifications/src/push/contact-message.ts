import type { PushData, PushNotification } from "./index";

/** Relative path served from portal/tech-pwa public assets. */
export const PUSH_ICON_PATH = "/short-logo.png";

export const PUSH_EVENT_CONTACT_MESSAGE_NEW = "CONTACT_MESSAGE_NEW";

export interface ContactMessagePushInput {
  /** Opaque Lead id used only to route the click; null when the message is unmatched. */
  leadId: string | null;
}

export interface ContactMessagePushPayload {
  notification: PushNotification;
  data: PushData;
}

/**
 * Format a new contact message push notification.
 *
 * Privacy (approved decision 3): the payload is generic. It carries no customer
 * name, company, topic, message text or preview — those would show on lock
 * screens and transit Google FCM. The only metadata is the event type and an
 * opaque lead id for click routing; the destination page loads the real details
 * from the authenticated API.
 */
export function formatContactMessagePush(input: ContactMessagePushInput): ContactMessagePushPayload {
  return {
    notification: {
      title: "Pesan baru",
      body: "Anda menerima pesan baru. Buka untuk melihat detailnya.",
    },
    data: {
      type: PUSH_EVENT_CONTACT_MESSAGE_NEW,
      leadId: input.leadId ?? "",
    },
  };
}

/**
 * Resolve absolute URL for FCM webpush notification icon.
 * Prefers PUSH_NOTIFICATION_ICON_URL, then apps.* origin (management app),
 * then portal.*, then first TRUSTED_ORIGINS entry.
 */
export function resolvePushIconUrl(): string | undefined {
  const explicit = process.env.PUSH_NOTIFICATION_ICON_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const origins =
    process.env.TRUSTED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  const appsOrigin = origins.find((origin) => /\/\/apps\./i.test(origin));
  const portalOrigin = origins.find((origin) => /\/\/portal\./i.test(origin));
  const baseOrigin = appsOrigin ?? portalOrigin ?? origins[0];
  if (!baseOrigin) {
    return undefined;
  }

  return `${baseOrigin.replace(/\/$/, "")}${PUSH_ICON_PATH}`;
}
