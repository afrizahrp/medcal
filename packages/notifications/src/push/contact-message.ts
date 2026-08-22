import type { PushData, PushNotification } from "./index";

/** Relative path served from portal/tech-pwa public assets. */
export const PUSH_ICON_PATH = "/short-logo.png";

const BODY_MAX = 120;
const TOPIC_FALLBACK = "General";

export interface ContactMessagePushInput {
  senderName: string;
  topicName: string | null;
  message: string;
  companyName: string;
  contactMessageId: string;
  leadId: string | null;
  companyId: string;
}

export interface ContactMessagePushPayload {
  notification: PushNotification;
  data: PushData;
}

/**
 * Format a new contact message push notification (Bumi Indah parity):
 * - Title: 📢 Pesan Baru dari {sender}
 * - Body: {topic}: {message preview}
 * - Data: sender, company, topic, ids for deep-link
 */
export function formatContactMessagePush(input: ContactMessagePushInput): ContactMessagePushPayload {
  const topic = input.topicName?.trim() || TOPIC_FALLBACK;
  const preview = input.message.trim().replace(/\s+/g, " ");
  const truncated =
    preview.length > BODY_MAX ? `${preview.slice(0, BODY_MAX - 1)}…` : preview;

  return {
    notification: {
      title: `📢 Pesan Baru dari ${input.senderName}`,
      body: `${topic}: ${truncated}`,
    },
    data: {
      type: "CONTACT_MESSAGE_NEW",
      contactMessageId: input.contactMessageId,
      leadId: input.leadId ?? "",
      sender: input.senderName,
      company: input.companyName,
      companyId: input.companyId,
      topic,
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
