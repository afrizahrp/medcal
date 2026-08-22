/**
 * FCM Push notification infrastructure — server-side only.
 *
 * This module provides a domain-neutral push sending abstraction.
 * It knows nothing about Lead, RBAC, or business logic — those concerns
 * belong to the caller (e.g., a notification service in apps/api).
 *
 * The abstraction is designed to support:
 * - Single message sending to a specific FCM token
 * - Batch sending to multiple tokens (future)
 * - Invalid token detection for cleanup
 */
import type { Message, BatchResponse, SendResponse } from "firebase-admin/messaging";
import { initializeFirebaseAdmin, isFirebaseInitialized, getFirebaseMessaging } from "./firebase-admin";

export { initializeFirebaseAdmin, isFirebaseInitialized } from "./firebase-admin";

/**
 * Minimal notification payload for FCM.
 * Keep payloads small — sensitive data should be fetched from API after click.
 */
export interface PushNotification {
  title: string;
  body: string;
}

/**
 * Optional data payload for FCM.
 * All values must be strings (FCM requirement).
 */
export interface PushData {
  [key: string]: string;
}

/**
 * Input for sending a push notification to a single FCM token.
 */
export interface SendPushInput {
  token: string;
  notification: PushNotification;
  data?: PushData;
  /** Absolute URL for webpush notification icon (e.g. company short-logo). */
  icon?: string;
}

export {
  formatContactMessagePush,
  resolvePushIconUrl,
  PUSH_ICON_PATH,
} from "./contact-message";
export type { ContactMessagePushInput, ContactMessagePushPayload } from "./contact-message";

function buildFcmMessage(input: SendPushInput): Message {
  const webpushNotification: NonNullable<Message["webpush"]>["notification"] = {
    title: input.notification.title,
    body: input.notification.body,
  };
  if (input.icon) {
    webpushNotification.icon = input.icon;
  }

  return {
    token: input.token,
    notification: {
      title: input.notification.title,
      body: input.notification.body,
    },
    webpush: {
      notification: webpushNotification,
    },
    ...(input.data ? { data: input.data } : {}),
  };
}

/**
 * Result of a push send operation.
 */
export interface SendPushResult {
  success: boolean;
  messageId?: string;
  /** True if the token is invalid/unregistered and should be deactivated */
  invalidToken?: boolean;
  error?: string;
}

/**
 * FCM error codes that indicate the token is invalid and should be deactivated.
 * See: https://firebase.google.com/docs/cloud-messaging/send-message#admin
 */
const INVALID_TOKEN_ERROR_CODES = [
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
];

/**
 * Redact a token for safe logging (shows first 8 and last 4 chars).
 */
function redactToken(token: string): string {
  if (token.length <= 16) {
    return "***";
  }
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

/**
 * Send a push notification to a single FCM token.
 *
 * This function is domain-neutral — it does not know about leads,
 * recipients, or business logic. The caller is responsible for:
 * - Determining who should receive the notification
 * - Looking up active FCM tokens for those users
 * - Handling invalid token cleanup based on the result
 *
 * @returns SendPushResult with success status and optional error info
 */
export async function sendPush(input: SendPushInput): Promise<SendPushResult> {
  // Initialize Firebase if not already done
  if (!isFirebaseInitialized()) {
    const initialized = initializeFirebaseAdmin();
    if (!initialized) {
      return {
        success: false,
        error: "Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)",
      };
    }
  }

  const message = buildFcmMessage(input);

  try {
    const messageId = await getFirebaseMessaging().send(message);
    return {
      success: true,
      messageId,
    };
  } catch (error) {
    const errorCode = (error as { code?: string }).code;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Determine if this is an invalid token error
    const invalidToken = errorCode ? INVALID_TOKEN_ERROR_CODES.includes(errorCode) : false;

    // Log without exposing full token
    console.error(
      `[push] Send failed for token ${redactToken(input.token)}:`,
      errorCode || errorMessage,
      invalidToken ? "(token should be deactivated)" : "",
    );

    return {
      success: false,
      invalidToken,
      error: errorCode || errorMessage,
    };
  }
}

/**
 * Send push notifications to multiple tokens.
 * Returns results for each token in the same order as input.
 *
 * This is more efficient than calling sendPush() multiple times
 * because it uses Firebase's batch sending.
 */
export async function sendPushBatch(
  inputs: SendPushInput[],
): Promise<SendPushResult[]> {
  if (inputs.length === 0) {
    return [];
  }

  // Initialize Firebase if not already done
  if (!isFirebaseInitialized()) {
    const initialized = initializeFirebaseAdmin();
    if (!initialized) {
      return inputs.map(() => ({
        success: false,
        error: "Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)",
      }));
    }
  }

  const messages: Message[] = inputs.map((input) => buildFcmMessage(input));

  try {
    const response: BatchResponse = await getFirebaseMessaging().sendEach(messages);

    return response.responses.map((res: SendResponse, index: number) => {
      if (res.success) {
        return {
          success: true,
          messageId: res.messageId,
        };
      }

      const errorCode = res.error?.code;
      const errorMessage = res.error?.message || "Unknown error";
      const invalidToken = errorCode ? INVALID_TOKEN_ERROR_CODES.includes(errorCode) : false;

      // Log without exposing full token
      console.error(
        `[push] Batch send failed for token ${redactToken(inputs[index].token)}:`,
        errorCode || errorMessage,
        invalidToken ? "(token should be deactivated)" : "",
      );

      return {
        success: false,
        invalidToken,
        error: errorCode || errorMessage,
      };
    });
  } catch (error) {
    // Batch request itself failed — return failure for all
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[push] Batch send failed:", errorMessage);

    return inputs.map(() => ({
      success: false,
      error: errorMessage,
    }));
  }
}
