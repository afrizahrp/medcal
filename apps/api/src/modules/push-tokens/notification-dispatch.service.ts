import { Inject, Injectable } from "@nestjs/common";
import { push } from "@medcal/notifications";
import type { FCMToken } from "@medcal/db";
import { NotificationRecipientService } from "./notification-recipient.service";
import { PushTokensService } from "./push-tokens.service";

interface PushNotificationPayload {
  title: string;
  body: string;
}

interface PushDataPayload {
  [key: string]: string;
}

export interface SendToUsersInput {
  companyId: string;
  userIds: string[];
  notification: PushNotificationPayload;
  data?: PushDataPayload;
  /** Override default short-logo icon URL for webpush. */
  icon?: string;
}

export interface SendToUsersResult {
  tokens: number;
  sent: number;
  failed: number;
  deactivated: number;
}

/**
 * Domain-neutral FCM dispatch for authenticated user recipients.
 *
 * Pipeline:
 * 1. Recipient resolution (caller-provided userIds)
 * 2. Notification eligibility (UserMembership.receiveNotifications)
 * 3. FCM token lookup (active tokens per eligible user)
 * 4. FCM send + invalid token cleanup
 */
@Injectable()
export class NotificationDispatchService {
  constructor(
    @Inject(PushTokensService)
    private readonly pushTokensService: PushTokensService,
    @Inject(NotificationRecipientService)
    private readonly notificationRecipientService: NotificationRecipientService,
  ) {}

  async sendToUsers(input: SendToUsersInput): Promise<SendToUsersResult> {
    const eligibleUserIds = await this.notificationRecipientService.resolveEligibleUserIds(
      input.companyId,
      input.userIds,
    );

    if (eligibleUserIds.length === 0) {
      return { tokens: 0, sent: 0, failed: 0, deactivated: 0 };
    }

    const tokens = await this.pushTokensService.getActiveTokensForUserIds(
      input.companyId,
      eligibleUserIds,
    );

    if (tokens.length === 0) {
      return { tokens: 0, sent: 0, failed: 0, deactivated: 0 };
    }

    const results = await this.dispatchToTokens(tokens, input.notification, input.data, input.icon);
    return {
      tokens: tokens.length,
      ...results,
    };
  }

  /**
   * Send to all company members with receiveNotifications enabled.
   */
  async sendToCompanyRecipients(
    input: Omit<SendToUsersInput, "userIds">,
  ): Promise<SendToUsersResult> {
    const userIds = await this.notificationRecipientService.findCompanyNotificationRecipientUserIds(
      input.companyId,
    );
    return this.sendToUsers({ ...input, userIds });
  }

  private async dispatchToTokens(
    tokens: FCMToken[],
    notification: PushNotificationPayload,
    data?: PushDataPayload,
    icon?: string,
  ): Promise<Omit<SendToUsersResult, "tokens">> {
    const iconUrl = icon ?? push.resolvePushIconUrl();
    const batchInputs = tokens.map((token) => ({
      token: token.token,
      notification,
      data,
      ...(iconUrl ? { icon: iconUrl } : {}),
    }));

    const results = await push.sendPushBatch(batchInputs);

    let sent = 0;
    let failed = 0;
    let deactivated = 0;

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.success) {
        sent++;
        continue;
      }

      failed++;
      if (result.invalidToken) {
        const didDeactivate = await this.pushTokensService.deactivateByToken(tokens[index].token);
        if (didDeactivate) {
          deactivated++;
        }
      }
    }

    return { sent, failed, deactivated };
  }
}
