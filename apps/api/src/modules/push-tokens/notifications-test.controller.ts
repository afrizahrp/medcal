import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { push } from "@medcal/notifications";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { PushTokensService } from "./push-tokens.service";

const testNotificationSchema = z.object({
  token: z.string().min(1, "Token is required"),
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().min(1, "Body is required").max(1000),
});

export interface TestNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  tokenDeactivated?: boolean;
}

/**
 * FCM test endpoint for Phase 3 verification.
 *
 * POST /notifications/test
 *
 * Security:
 * - Requires authentication via CompanyRoleGuard
 * - Requires notification:test permission (SUPERADMIN-only by default)
 * - Does NOT expose Firebase credentials
 * - Redacts FCM token in logs
 * - Deactivates invalid tokens automatically
 *
 * This is a dev/admin utility for verifying backend->FCM sending works.
 * It is NOT a generic notification relay — it requires specific permission.
 */
@Controller("notifications")
@UseGuards(CompanyRoleGuard)
export class NotificationsTestController {
  constructor(
    @Inject(PushTokensService)
    private readonly pushTokensService: PushTokensService,
  ) {}

  @Post("test")
  @HttpCode(200)
  @RequirePermission("notification", "test")
  async sendTestNotification(
    @Body() rawBody: unknown,
  ): Promise<TestNotificationResult> {
    const parsed = testNotificationSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid test notification request",
        code: "INVALID_TEST_NOTIFICATION",
        issues: parsed.error.flatten(),
      });
    }

    const { token, title, body } = parsed.data;

    const result = await push.sendPush({
      token,
      notification: { title, body },
    });

    let tokenDeactivated = false;
    if (result.invalidToken) {
      const deactivated = await this.pushTokensService.deactivateByToken(token);
      tokenDeactivated = deactivated;
    }

    if (result.success) {
      return {
        success: true,
        messageId: result.messageId,
      };
    }

    return {
      success: false,
      error: result.error,
      tokenDeactivated,
    };
  }
}
