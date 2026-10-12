import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { push } from "@medcal/notifications";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";
import type { NotificationDispatchService } from "../push-tokens/notification-dispatch.service";

describe("formatContactMessagePush", () => {
  it("is generic: only the event type and an opaque lead id", () => {
    const payload = push.formatContactMessagePush({ leadId: "lead-1" });

    expect(payload.notification).toEqual({
      title: "Pesan baru",
      body: "Anda menerima pesan baru. Buka untuk melihat detailnya.",
    });
    expect(payload.data).toEqual({ type: "CONTACT_MESSAGE_NEW", leadId: "lead-1" });
  });

  it("uses an empty lead id (route to the list) for an unmatched message", () => {
    expect(push.formatContactMessagePush({ leadId: null }).data).toEqual({
      type: "CONTACT_MESSAGE_NEW",
      leadId: "",
    });
  });
});

describe("formatLeadAssignedPush", () => {
  it("is generic: only the event type and an opaque lead id", () => {
    const payload = push.formatLeadAssignedPush({ leadId: "lead-9" });

    expect(payload.notification).toEqual({
      title: "Lead baru untuk Anda",
      body: "Sebuah lead ditugaskan kepada Anda. Buka untuk melihat detailnya.",
    });
    expect(payload.data).toEqual({ type: "LEAD_ASSIGNED", leadId: "lead-9" });
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
  // The prisma mock above is module-level and shared by every test in this
  // file; reset its call history so assertions only see the current test.
  beforeEach(() => {
    vi.mocked(prisma.contactMessage.findFirst).mockReset();
  });

  it("dispatches a generic, portal-scoped push to all company recipients", async () => {
    const sendToCompanyRecipients = vi.fn().mockResolvedValue({
      tokens: 1,
      sent: 1,
      failed: 0,
      deactivated: 0,
    });
    const notificationDispatch = {
      sendToCompanyRecipients,
    } as unknown as NotificationDispatchService;

    vi.mocked(prisma.contactMessage.findFirst).mockResolvedValue({ leadId: "lead-1" } as never);

    const service = new ContactMessagesService(notificationDispatch);
    await service.notifyNewContactMessage("PKM", "msg-1");

    expect(sendToCompanyRecipients).toHaveBeenCalledWith({
      companyId: "PKM",
      apps: ["PORTAL", "WEB"],
      notification: {
        title: "Pesan baru",
        body: "Anda menerima pesan baru. Buka untuk melihat detailnya.",
      },
      data: { type: "CONTACT_MESSAGE_NEW", leadId: "lead-1" },
    });
    expect(sendToCompanyRecipients.mock.calls[0][0].apps).not.toContain("TECH_PWA");
  });

  it("never loads or sends sender name, company, topic or message text", async () => {
    const sendToCompanyRecipients = vi.fn().mockResolvedValue({ tokens: 0, sent: 0, failed: 0, deactivated: 0 });
    // Even if the row carried personal details, only leadId is selected and used.
    vi.mocked(prisma.contactMessage.findFirst).mockResolvedValue({
      leadId: "lead-1",
      name: "Budi Santoso",
      message: "Butuh kalibrasi alat lab minggu depan.",
      topic: { name: "Kalibrasi" },
      company: { name: "PT Kalibrasi Medika" },
    } as never);

    const service = new ContactMessagesService({
      sendToCompanyRecipients,
    } as unknown as NotificationDispatchService);
    await service.notifyNewContactMessage("PKM", "msg-1");

    const query = vi.mocked(prisma.contactMessage.findFirst).mock.calls[0][0];
    expect(query).toMatchObject({ where: { id: "msg-1", companyId: "PKM" }, select: { leadId: true } });

    const serialized = JSON.stringify(sendToCompanyRecipients.mock.calls[0][0]);
    for (const secret of ["Budi Santoso", "Butuh kalibrasi", "Kalibrasi", "PT Kalibrasi Medika"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  describe("failure isolation (best-effort, fire-and-forget)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("resolves and logs a non-sensitive error when the database lookup fails", async () => {
      const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
      const sendToCompanyRecipients = vi.fn();
      const dbError = Object.assign(new Error("connection to db failed for user=secret@example.com"), {
        code: "P1001",
        name: "PrismaClientInitializationError",
      });
      vi.mocked(prisma.contactMessage.findFirst).mockRejectedValue(dbError);

      const service = new ContactMessagesService({ sendToCompanyRecipients } as unknown as NotificationDispatchService);
      await expect(service.notifyNewContactMessage("PKM", "msg-1")).resolves.toBeUndefined();

      expect(sendToCompanyRecipients).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledTimes(1);
      const logged = String(errorLog.mock.calls[0][0]);
      expect(logged).toContain("CONTACT_MESSAGE_NEW");
      expect(logged).toContain("PrismaClientInitializationError:P1001");
      expect(logged).not.toContain("secret@example.com");
    });

    it("resolves and logs when the dispatch itself rejects", async () => {
      const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
      vi.mocked(prisma.contactMessage.findFirst).mockResolvedValue({ leadId: "lead-1" } as never);
      const sendToCompanyRecipients = vi.fn().mockRejectedValue(new Error("token abc123 leaked in message"));

      const service = new ContactMessagesService({ sendToCompanyRecipients } as unknown as NotificationDispatchService);
      await expect(service.notifyNewContactMessage("PKM", "msg-1")).resolves.toBeUndefined();

      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(String(errorLog.mock.calls[0][0])).not.toContain("abc123");
    });

    it("a `void`-ed call (as in create()) raises no unhandled rejection", async () => {
      vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
      vi.mocked(prisma.contactMessage.findFirst).mockRejectedValue(new Error("boom"));
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      try {
        const service = new ContactMessagesService({
          sendToCompanyRecipients: vi.fn(),
        } as unknown as NotificationDispatchService);
        void service.notifyNewContactMessage("PKM", "msg-1");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", unhandled);
      }
    });
  });

  it("never rejects when dispatch fails — logs and resolves", async () => {
    const sendToCompanyRecipients = vi.fn().mockRejectedValue(new Error("dispatch down"));
    vi.mocked(prisma.contactMessage.findFirst).mockResolvedValue({
      id: "msg-1",
      name: "Budi",
      message: "Butuh kalibrasi",
      leadId: null,
      topic: null,
      company: { name: "PT Kalibrasi Medika" },
    } as never);

    const service = new ContactMessagesService({
      sendToCompanyRecipients,
    } as unknown as NotificationDispatchService);
    const logError = vi
      .spyOn((service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, "error")
      .mockImplementation(() => {});

    await expect(service.notifyNewContactMessage("PKM", "msg-1")).resolves.toBeUndefined();
    expect(sendToCompanyRecipients).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("no-ops when dispatch service is not injected", async () => {
    const service = new ContactMessagesService();
    await expect(service.notifyNewContactMessage("PKM", "msg-1")).resolves.toBeUndefined();
    expect(prisma.contactMessage.findFirst).not.toHaveBeenCalled();
  });
});
