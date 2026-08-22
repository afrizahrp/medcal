import { Injectable } from "@nestjs/common";
import { prisma } from "@medcal/db";

/**
 * Resolves which user IDs are eligible to receive push notifications
 * for a given company. Separate from RBAC — eligibility is a membership
 * business setting (UserMembership.receiveNotifications), not a permission.
 */
@Injectable()
export class NotificationRecipientService {
  /**
   * Filter candidate recipient user IDs to those eligible for FCM in this company.
   *
   * Requirements (all must pass):
   * - UserMembership exists for (companyId, userId)
   * - receiveNotifications === true
   * - User.status === ACTIVE
   */
  async resolveEligibleUserIds(companyId: string, userIds: string[]): Promise<string[]> {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return [];
    }

    const memberships = await prisma.userMembership.findMany({
      where: {
        companyId,
        userId: { in: uniqueUserIds },
        receiveNotifications: true,
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });

    return memberships.map((row) => row.userId);
  }

  /**
   * All active company members who opted in to receive push notifications.
   */
  async findCompanyNotificationRecipientUserIds(companyId: string): Promise<string[]> {
    const memberships = await prisma.userMembership.findMany({
      where: {
        companyId,
        receiveNotifications: true,
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });

    return memberships.map((row) => row.userId);
  }
}
