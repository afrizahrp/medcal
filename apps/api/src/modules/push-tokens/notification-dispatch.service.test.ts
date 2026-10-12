import { describe, expect, it, vi } from "vitest";
import { NotificationDispatchService, PORTAL_EVENT_PUSH_APPS } from "./notification-dispatch.service";
import type { NotificationRecipientService } from "./notification-recipient.service";
import type { PushTokensService } from "./push-tokens.service";

vi.mock("@medcal/notifications", () => ({
  push: {
    sendPushBatch: vi.fn(),
    resolvePushIconUrl: vi.fn(() => undefined),
  },
}));

import { push } from "@medcal/notifications";

describe("NotificationDispatchService", () => {
  it("returns zero counts when no users are notification-eligible", async () => {
    const pushTokensService = {
      getActiveTokensForUserIds: vi.fn(),
      deactivateByToken: vi.fn(),
    } as unknown as PushTokensService;
    const notificationRecipientService = {
      resolveEligibleUserIds: vi.fn().mockResolvedValue([]),
    } as unknown as NotificationRecipientService;

    const service = new NotificationDispatchService(
      pushTokensService,
      notificationRecipientService,
    );
    const result = await service.sendToUsers({
      companyId: "PKM",
      userIds: ["user-1"],
      apps: PORTAL_EVENT_PUSH_APPS,
      notification: { title: "Test", body: "Body" },
    });

    expect(result).toEqual({ tokens: 0, sent: 0, failed: 0, deactivated: 0 });
    expect(pushTokensService.getActiveTokensForUserIds).not.toHaveBeenCalled();
    expect(push.sendPushBatch).not.toHaveBeenCalled();
  });

  it("returns zero counts when eligible user has no active tokens", async () => {
    const pushTokensService = {
      getActiveTokensForUserIds: vi.fn().mockResolvedValue([]),
      deactivateByToken: vi.fn(),
    } as unknown as PushTokensService;
    const notificationRecipientService = {
      resolveEligibleUserIds: vi.fn().mockResolvedValue(["user-1"]),
    } as unknown as NotificationRecipientService;

    const service = new NotificationDispatchService(
      pushTokensService,
      notificationRecipientService,
    );
    const result = await service.sendToUsers({
      companyId: "PKM",
      userIds: ["user-1"],
      apps: PORTAL_EVENT_PUSH_APPS,
      notification: { title: "Test", body: "Body" },
    });

    expect(result).toEqual({ tokens: 0, sent: 0, failed: 0, deactivated: 0 });
    expect(push.sendPushBatch).not.toHaveBeenCalled();
  });

  it("E — sends to all active tokens for an eligible user (multi-device)", async () => {
    const pushTokensService = {
      getActiveTokensForUserIds: vi.fn().mockResolvedValue([
        { id: "t1", token: "fcm-laptop", userId: "user-1", companyId: "PKM", isActive: true },
        { id: "t2", token: "fcm-android", userId: "user-1", companyId: "PKM", isActive: true },
      ]),
      deactivateByToken: vi.fn(),
    } as unknown as PushTokensService;
    const notificationRecipientService = {
      resolveEligibleUserIds: vi.fn().mockResolvedValue(["user-1"]),
    } as unknown as NotificationRecipientService;

    vi.mocked(push.sendPushBatch).mockResolvedValue([
      { success: true, messageId: "msg-1" },
      { success: true, messageId: "msg-2" },
    ]);

    const service = new NotificationDispatchService(
      pushTokensService,
      notificationRecipientService,
    );
    const result = await service.sendToUsers({
      companyId: "PKM",
      userIds: ["user-1"],
      apps: PORTAL_EVENT_PUSH_APPS,
      notification: { title: "Lead assigned to you", body: "Example Lead" },
    });

    expect(result).toEqual({ tokens: 2, sent: 2, failed: 0, deactivated: 0 });
    expect(push.sendPushBatch).toHaveBeenCalledWith([
      expect.objectContaining({ token: "fcm-laptop" }),
      expect.objectContaining({ token: "fcm-android" }),
    ]);
  });

  it("deactivates invalid tokens after batch send failures", async () => {
    const pushTokensService = {
      getActiveTokensForUserIds: vi.fn().mockResolvedValue([
        { id: "token-row-1", token: "fcm-token-1", userId: "user-1", companyId: "PKM", isActive: true },
      ]),
      deactivateByToken: vi.fn().mockResolvedValue(true),
    } as unknown as PushTokensService;
    const notificationRecipientService = {
      resolveEligibleUserIds: vi.fn().mockResolvedValue(["user-1"]),
    } as unknown as NotificationRecipientService;

    vi.mocked(push.sendPushBatch).mockResolvedValue([
      { success: false, invalidToken: true, error: "messaging/registration-token-not-registered" },
    ]);

    const service = new NotificationDispatchService(
      pushTokensService,
      notificationRecipientService,
    );
    const result = await service.sendToUsers({
      companyId: "PKM",
      userIds: ["user-1"],
      apps: PORTAL_EVENT_PUSH_APPS,
      notification: { title: "Lead assigned to you", body: "Example Lead" },
      data: { type: "LEAD_ASSIGNED", leadId: "lead-1" },
    });

    expect(result).toEqual({ tokens: 1, sent: 0, failed: 1, deactivated: 1 });
    expect(pushTokensService.deactivateByToken).toHaveBeenCalledWith("fcm-token-1");
  });

  it("limits the token lookup to the requested applications (portal events never include TECH_PWA)", async () => {
    const getActiveTokensForUserIds = vi.fn().mockResolvedValue([]);
    const service = new NotificationDispatchService(
      { getActiveTokensForUserIds, deactivateByToken: vi.fn() } as unknown as PushTokensService,
      {
        resolveEligibleUserIds: vi.fn().mockResolvedValue(["user-1"]),
      } as unknown as NotificationRecipientService,
    );

    await service.sendToUsers({
      companyId: "PKM",
      userIds: ["user-1"],
      apps: PORTAL_EVENT_PUSH_APPS,
      notification: { title: "Test", body: "Body" },
    });

    expect(getActiveTokensForUserIds).toHaveBeenCalledWith("PKM", ["user-1"], ["PORTAL", "WEB"]);
    expect(PORTAL_EVENT_PUSH_APPS).not.toContain("TECH_PWA");
  });

  it("sendToCompanyRecipients forwards the app scope to the per-user dispatch", async () => {
    const getActiveTokensForUserIds = vi.fn().mockResolvedValue([]);
    const service = new NotificationDispatchService(
      { getActiveTokensForUserIds, deactivateByToken: vi.fn() } as unknown as PushTokensService,
      {
        findCompanyNotificationRecipientUserIds: vi.fn().mockResolvedValue(["user-1", "user-2"]),
        resolveEligibleUserIds: vi.fn().mockResolvedValue(["user-1", "user-2"]),
      } as unknown as NotificationRecipientService,
    );

    await service.sendToCompanyRecipients({
      companyId: "PKM",
      apps: ["PORTAL"],
      notification: { title: "Test", body: "Body" },
    });

    expect(getActiveTokensForUserIds).toHaveBeenCalledWith("PKM", ["user-1", "user-2"], ["PORTAL"]);
  });
});
