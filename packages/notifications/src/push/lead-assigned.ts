import type { PushData, PushNotification } from "./index";

export const PUSH_EVENT_LEAD_ASSIGNED = "LEAD_ASSIGNED";

export interface LeadAssignedPushInput {
  /** Opaque Lead id used only to route the click. */
  leadId: string;
}

export interface LeadAssignedPushPayload {
  notification: PushNotification;
  data: PushData;
}

/**
 * Format a "lead assigned to you" push notification.
 *
 * Privacy (approved decision 3): generic text only — no lead or customer name.
 * The destination page loads the real details from the authenticated API.
 */
export function formatLeadAssignedPush(input: LeadAssignedPushInput): LeadAssignedPushPayload {
  return {
    notification: {
      title: "Lead baru untuk Anda",
      body: "Sebuah lead ditugaskan kepada Anda. Buka untuk melihat detailnya.",
    },
    data: {
      type: PUSH_EVENT_LEAD_ASSIGNED,
      leadId: input.leadId,
    },
  };
}
