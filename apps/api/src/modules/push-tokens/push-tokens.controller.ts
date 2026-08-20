import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { PushTokensService, type RegisterTokenResult } from "./push-tokens.service";
import type { FCMToken } from "@medcal/db";

/**
 * Valid PushApp enum values — matches Prisma schema.
 * DO NOT add customer apps here until Phase 2+ decision.
 */
const VALID_PUSH_APPS = ["WEB", "PORTAL", "TECH_PWA"] as const;

/**
 * Schema for token registration request.
 *
 * CRITICAL SECURITY:
 * - userId and companyId are NOT accepted from client
 * - They are derived server-side from the authenticated session
 */
const registerTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
  deviceType: z.string().min(1, "Device type is required").max(100),
  app: z.enum(VALID_PUSH_APPS, {
    errorMap: () => ({ message: `Invalid app. Must be one of: ${VALID_PUSH_APPS.join(", ")}` }),
  }),
});

/**
 * FCM Push Token management controller.
 *
 * Routes are prefixed with /notifications/push-tokens to match
 * the notification infrastructure domain boundary.
 *
 * All routes require authentication via CompanyRoleGuard, which:
 * - Verifies session exists (Better Auth)
 * - Verifies user has ACTIVE status
 * - Verifies user has membership in the deployment's COMPANY_ID
 * - Injects userId, companyId, membershipRole into request
 *
 * No additional permission check is required because:
 * - Token registration is a user's personal action
 * - Users can only manage their own tokens
 * - Ownership is enforced in the service layer
 */
@Controller("notifications/push-tokens")
@UseGuards(CompanyRoleGuard)
export class PushTokensController {
  constructor(
    @Inject(PushTokensService)
    private readonly service: PushTokensService,
  ) {}

  /**
   * Register an FCM token for the authenticated user.
   *
   * POST /notifications/push-tokens
   *
   * Security:
   * - Requires authenticated ACTIVE user with membership
   * - userId/companyId derived server-side, never from client
   * - Token ownership enforced — cannot hijack another user's token
   */
  @Post()
  async register(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() rawBody: unknown,
  ): Promise<RegisterTokenResult> {
    const parsed = registerTokenSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid token registration data",
        code: "INVALID_TOKEN_DATA",
        issues: parsed.error.flatten(),
      });
    }

    return this.service.registerToken(companyId, userId, parsed.data);
  }

  /**
   * List the authenticated user's active FCM tokens.
   *
   * GET /notifications/push-tokens
   *
   * Useful for debugging and token management UI.
   */
  @Get()
  async list(
    @CompanyId() companyId: string,
    @UserId() userId: string,
  ): Promise<FCMToken[]> {
    return this.service.listUserTokens(companyId, userId);
  }

  /**
   * Revoke (deactivate) a specific token.
   *
   * DELETE /notifications/push-tokens/:tokenId
   *
   * Security:
   * - User can only revoke tokens they own
   * - Attempting to revoke another user's token returns 404
   */
  @Delete(":tokenId")
  @HttpCode(204)
  async revoke(
    @UserId() userId: string,
    @Param("tokenId") tokenId: string,
  ): Promise<void> {
    await this.service.revokeToken(userId, tokenId);
  }
}
