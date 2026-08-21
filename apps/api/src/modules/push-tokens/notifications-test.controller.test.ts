import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { NotificationsTestController } from "./notifications-test.controller";
import { PushTokensService } from "./push-tokens.service";

vi.mock("@medcal/notifications", () => ({
  push: {
    sendPush: vi.fn(),
  },
}));

import { push } from "@medcal/notifications";

const mockSendPush = push.sendPush as ReturnType<typeof vi.fn>;

describe("NotificationsTestController", () => {
  let controller: NotificationsTestController;
  let mockPushTokensService: { deactivateByToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPushTokensService = {
      deactivateByToken: vi.fn(),
    };
    controller = new NotificationsTestController(
      mockPushTokensService as unknown as PushTokensService,
    );
  });

  describe("sendTestNotification", () => {
    it("should throw BadRequestException for missing token", async () => {
      const body = { title: "Test", body: "Test body" };
      await expect(controller.sendTestNotification(body)).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for empty token", async () => {
      const body = { token: "", title: "Test", body: "Test body" };
      await expect(controller.sendTestNotification(body)).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for missing title", async () => {
      const body = { token: "valid-token", body: "Test body" };
      await expect(controller.sendTestNotification(body)).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for missing body", async () => {
      const body = { token: "valid-token", title: "Test" };
      await expect(controller.sendTestNotification(body)).rejects.toThrow(BadRequestException);
    });

    it("should return success result when FCM send succeeds", async () => {
      mockSendPush.mockResolvedValue({
        success: true,
        messageId: "projects/test/messages/123",
      });

      const body = {
        token: "valid-fcm-token",
        title: "Test Notification",
        body: "FCM backend test successful.",
      };

      const result = await controller.sendTestNotification(body);

      expect(result).toEqual({
        success: true,
        messageId: "projects/test/messages/123",
      });
      expect(mockSendPush).toHaveBeenCalledWith({
        token: "valid-fcm-token",
        notification: {
          title: "Test Notification",
          body: "FCM backend test successful.",
        },
      });
      expect(mockPushTokensService.deactivateByToken).not.toHaveBeenCalled();
    });

    it("should return failure result when FCM send fails (non-invalid-token error)", async () => {
      mockSendPush.mockResolvedValue({
        success: false,
        error: "messaging/quota-exceeded",
      });

      const body = {
        token: "valid-fcm-token",
        title: "Test",
        body: "Test body",
      };

      const result = await controller.sendTestNotification(body);

      expect(result).toEqual({
        success: false,
        error: "messaging/quota-exceeded",
        tokenDeactivated: false,
      });
      expect(mockPushTokensService.deactivateByToken).not.toHaveBeenCalled();
    });

    it("should deactivate token when FCM returns invalid-token error", async () => {
      mockSendPush.mockResolvedValue({
        success: false,
        invalidToken: true,
        error: "messaging/invalid-registration-token",
      });
      mockPushTokensService.deactivateByToken.mockResolvedValue(true);

      const body = {
        token: "invalid-fcm-token",
        title: "Test",
        body: "Test body",
      };

      const result = await controller.sendTestNotification(body);

      expect(result).toEqual({
        success: false,
        error: "messaging/invalid-registration-token",
        tokenDeactivated: true,
      });
      expect(mockPushTokensService.deactivateByToken).toHaveBeenCalledWith("invalid-fcm-token");
    });

    it("should report tokenDeactivated=false when token not found in DB", async () => {
      mockSendPush.mockResolvedValue({
        success: false,
        invalidToken: true,
        error: "messaging/registration-token-not-registered",
      });
      mockPushTokensService.deactivateByToken.mockResolvedValue(false);

      const body = {
        token: "unregistered-token",
        title: "Test",
        body: "Test body",
      };

      const result = await controller.sendTestNotification(body);

      expect(result).toEqual({
        success: false,
        error: "messaging/registration-token-not-registered",
        tokenDeactivated: false,
      });
      expect(mockPushTokensService.deactivateByToken).toHaveBeenCalledWith("unregistered-token");
    });

    it("should handle Firebase not configured error", async () => {
      mockSendPush.mockResolvedValue({
        success: false,
        error: "Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)",
      });

      const body = {
        token: "valid-fcm-token",
        title: "Test",
        body: "Test body",
      };

      const result = await controller.sendTestNotification(body);

      expect(result).toEqual({
        success: false,
        error: "Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)",
        tokenDeactivated: false,
      });
    });
  });
});
