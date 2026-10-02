import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";
import type { NotificationDispatchService } from "../push-tokens/notification-dispatch.service";

// Real Postgres, same convention as contact-messages.service.test.ts.
// Proves the public-intake persistence does not depend on notification
// delivery, and that a failed (fire-and-forget) dispatch never surfaces as
// an unhandled rejection.
const companyId = "PKM";
const messageIds: string[] = [];
const leadIds: string[] = [];

function payload() {
  return {
    getFrom: "CONTACTFORM",
    name: "Notif Test",
    email: `notif-${randomUUID().slice(0, 8)}@example.com`,
    message: "Butuh kalibrasi alat.",
  };
}

function dispatchWith(sendToCompanyRecipients: ReturnType<typeof vi.fn>) {
  return { sendToCompanyRecipients } as unknown as NotificationDispatchService;
}

function loggerErrorSpy(service: ContactMessagesService) {
  return vi
    .spyOn((service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, "error")
    .mockImplementation(() => {});
}

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("ContactMessagesService.create — notification outcome does not affect intake", () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeAll(() => {
    process.on("unhandledRejection", onUnhandled);
  });
  beforeEach(() => {
    unhandled.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    process.off("unhandledRejection", onUnhandled);
    await prisma.contactMessage.deleteMany({ where: { id: { in: messageIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  });

  async function createTracked(service: ContactMessagesService) {
    const result = await service.create(companyId, payload());
    messageIds.push(result.id);
    if (result.leadId) leadIds.push(result.leadId);
    await flush();
    return result;
  }

  it("Case A: notification success -> persisted + success result + dispatch invoked", async () => {
    const send = vi.fn().mockResolvedValue({ tokens: 1, sent: 1, failed: 0, deactivated: 0 });
    const service = new ContactMessagesService(dispatchWith(send));
    const logError = loggerErrorSpy(service);

    const result = await createTracked(service);

    expect(await prisma.contactMessage.findUnique({ where: { id: result.id } })).not.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  it("Case B: dispatch rejects -> still persisted + success result, error logged, no unhandled rejection", async () => {
    const send = vi.fn().mockRejectedValue(new Error("dispatch down"));
    const service = new ContactMessagesService(dispatchWith(send));
    const logError = loggerErrorSpy(service);

    const result = await createTracked(service);

    expect(result.id).toBeTruthy();
    expect(await prisma.contactMessage.findUnique({ where: { id: result.id } })).not.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(unhandled).toEqual([]);
  });

  it("Case B: DB error while loading the message for notification is also contained", async () => {
    const send = vi.fn();
    const service = new ContactMessagesService(dispatchWith(send));
    const logError = loggerErrorSpy(service);

    // Only the notification lookup (contactMessage.findFirst) fails; create()
    // itself does not use findFirst on ContactMessage.
    vi.spyOn(prisma.contactMessage, "findFirst").mockRejectedValue(new Error("db blip"));

    const result = await createTracked(service);

    expect(await prisma.contactMessage.findUnique({ where: { id: result.id } })).not.toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(unhandled).toEqual([]);
  });
});
