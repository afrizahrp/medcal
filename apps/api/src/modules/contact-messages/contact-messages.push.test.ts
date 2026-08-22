import { afterEach, describe, expect, it, vi } from "vitest";
import { push } from "@medcal/notifications";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";
import type { NotificationDispatchService } from "../push-tokens/notification-dispatch.service";

describe("formatContactMessagePush", () => {
  it("formats title and body like Bumi Indah", () => {
    const payload = push.formatContactMessagePush({
      senderName: "Budi Santoso",
      topicName: "Kalibrasi",
      message: "Butuh kalibrasi alat lab minggu depan.",
      companyName: "PT Kalibrasi Medika",
      contactMessageId: "msg-1",
      leadId: "lead-1",
      companyId: "PKM",
    });

    expect(payload.notification.title).toBe("📢 Pesan Baru dari Budi Santoso");
    expect(payload.notification.body).toBe("Kalibrasi: Butuh kalibrasi alat lab minggu depan.");
    expect(payload.data.type).toBe("CONTACT_MESSAGE_NEW");
    expect(payload.data.sender).toBe("Budi Santoso");
    expect(payload.data.company).toBe("PT Kalibrasi Medika");
    expect(payload.data.topic).toBe("Kalibrasi");
  });
});

describe("resolvePushIconUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers apps origin over portal and marketing site", () => {
    delete process.env.PUSH_NOTIFICATION_ICON_URL;
    process.env.TRUSTED_ORIGINS =
      "https://kalibrasimedika.co.id,https://apps.kalibrasimedika.co.id,https://portal.kalibrasimedika.co.id";
    expect(push.resolvePushIconUrl()).toBe("https://apps.kalibrasimedika.co.id/short-logo.png");
  });

  it("prefers PUSH_NOTIFICATION_ICON_URL when set", () => {
    process.env.PUSH_NOTIFICATION_ICON_URL = "https://apps.kalibrasimedika.co.id/short-logo.png";
    expect(push.resolvePushIconUrl()).toBe("https://apps.kalibrasimedika.co.id/short-logo.png");
  });
});

vi.mock("@medcal/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@medcal/db")>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      contactMessage: {
        findFirst: vi.fn(),
      },
    },
  };
});

describe("ContactMessagesService.notifyNewContactMessage", () => {
  it("dispatches formatted push to all company recipients", async () => {
    const sendToCompanyRecipients = vi.fn().mockResolvedValue({
      tokens: 1,
      sent: 1,
      failed: 0,
      deactivated: 0,
    });
    const notificationDispatch = {
      sendToCompanyRecipients,
    } as unknown as NotificationDispatchService;

    vi.mocked(prisma.contactMessage.findFirst).mockResolvedValue({
      id: "msg-1",
      name: "Budi",
      message: "Butuh kalibrasi",
      leadId: "lead-1",
      topic: { name: "Kalibrasi" },
      company: { name: "PT Kalibrasi Medika" },
    } as never);

    const service = new ContactMessagesService(notificationDispatch);
    await service.notifyNewContactMessage("PKM", "msg-1");

    expect(sendToCompanyRecipients).toHaveBeenCalledWith({
      companyId: "PKM",
      notification: {
        title: "📢 Pesan Baru dari Budi",
        body: "Kalibrasi: Butuh kalibrasi",
      },
      data: expect.objectContaining({
        type: "CONTACT_MESSAGE_NEW",
        contactMessageId: "msg-1",
        leadId: "lead-1",
        sender: "Budi",
        company: "PT Kalibrasi Medika",
        topic: "Kalibrasi",
      }),
    });
  });

  it("no-ops when dispatch service is not injected", async () => {
    const service = new ContactMessagesService();
    await expect(service.notifyNewContactMessage("PKM", "msg-1")).resolves.toBeUndefined();
    expect(prisma.contactMessage.findFirst).not.toHaveBeenCalled();
  });
});
