import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { FCMToken, PushApp } from "@medcal/db";

/**
 * Input for registering a new FCM token.
 * userId and companyId are NOT included — they come from the authenticated context.
 */
export interface RegisterTokenInput {
  token: string;
  deviceType: string;
  app: PushApp;
}

/**
 * Result of a token registration operation.
 */
export interface RegisterTokenResult {
  id: string;
  created: boolean;
  reactivated: boolean;
}

/**
 * FCM Token registration and management service.
 *
 * Security principles:
 * - userId/companyId are NEVER accepted from client input
 * - Token ownership is enforced for all operations
 * - Only the token owner can revoke/delete their token
 * - Cross-user token reassignment is prohibited
 */
@Injectable()
export class PushTokensService {
  /**
   * Opt the user into company push delivery when they register a device token.
   * Membership eligibility is separate from lead assignment — no per-lead assign needed.
   */
  private async ensureMembershipReceivesNotifications(
    companyId: string,
    userId: string,
  ): Promise<void> {
    await prisma.userMembership.updateMany({
      where: { companyId, userId },
      data: { receiveNotifications: true },
    });
  }

  /**
   * Register an FCM token for the authenticated user.
   *
   * Semantics:
   * - New token: Create new FCMToken record
   * - Existing token owned by same user: Reactivate and update lastUsedAt
   * - Existing token owned by different user: Return conflict error
   *
   * @param companyId - Derived from authenticated user's membership (server-side)
   * @param userId - Derived from authenticated session (server-side)
   * @param input - Token data from client (token, deviceType, app only)
   */
  async registerToken(
    companyId: string,
    userId: string,
    input: RegisterTokenInput,
  ): Promise<RegisterTokenResult> {
    // Check if token already exists (globally unique)
    const existing = await prisma.fCMToken.findUnique({
      where: { token: input.token },
    });

    if (existing) {
      // Token exists — check ownership
      if (existing.userId !== userId) {
        // Token belongs to another user — DO NOT reassign
        throw new ConflictException({
          message: "Token is already registered to another user",
          code: "TOKEN_OWNERSHIP_CONFLICT",
        });
      }

      // Same user — reactivate/refresh the token
      await prisma.fCMToken.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          lastUsedAt: new Date(),
          // Update metadata in case it changed
          deviceType: input.deviceType,
          app: input.app,
          companyId, // Update company in case user switched companies
        },
      });

      await this.ensureMembershipReceivesNotifications(companyId, userId);

      return {
        id: existing.id,
        created: false,
        reactivated: !existing.isActive,
      };
    }

    // New token — create record
    const created = await prisma.fCMToken.create({
      data: {
        companyId,
        userId,
        token: input.token,
        deviceType: input.deviceType,
        app: input.app,
        isActive: true,
        lastUsedAt: new Date(),
      },
    });

    await this.ensureMembershipReceivesNotifications(companyId, userId);

    return {
      id: created.id,
      created: true,
      reactivated: false,
    };
  }

  /**
   * Revoke (deactivate) a token by ID.
   * User can only revoke tokens they own.
   *
   * Uses soft-delete (isActive = false) to match existing schema design.
   *
   * @param userId - Derived from authenticated session (server-side)
   * @param tokenId - The FCMToken record ID
   */
  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const token = await prisma.fCMToken.findUnique({
      where: { id: tokenId },
    });

    if (!token) {
      throw new NotFoundException({
        message: "Token not found",
        code: "TOKEN_NOT_FOUND",
      });
    }

    // Ownership check — user can only revoke their own tokens
    if (token.userId !== userId) {
      throw new NotFoundException({
        message: "Token not found",
        code: "TOKEN_NOT_FOUND",
      });
    }

    await prisma.fCMToken.update({
      where: { id: tokenId },
      data: { isActive: false },
    });
  }

  /**
   * List all active tokens for the authenticated user in the current company.
   * Useful for debugging/management UI (not required for Phase 1 MVP).
   */
  async listUserTokens(companyId: string, userId: string): Promise<FCMToken[]> {
    return prisma.fCMToken.findMany({
      where: {
        companyId,
        userId,
        isActive: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  /**
   * Look up all active FCM tokens for the given users within a company.
   * Used by notification dispatch to resolve per-user recipients.
   */
  async getActiveTokensForUserIds(companyId: string, userIds: string[]): Promise<FCMToken[]> {
    if (userIds.length === 0) {
      return [];
    }

    return prisma.fCMToken.findMany({
      where: {
        companyId,
        userId: { in: userIds },
        isActive: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  /**
   * Deactivate a token by its FCM token string (for invalid token cleanup).
   * This is called when Firebase returns an invalid-registration-token error.
   *
   * Note: This does not require user ownership check because it's
   * triggered by Firebase's response, not by user action.
   */
  async deactivateByToken(token: string): Promise<boolean> {
    const result = await prisma.fCMToken.updateMany({
      where: { token, isActive: true },
      data: { isActive: false },
    });
    return result.count > 0;
  }
}
