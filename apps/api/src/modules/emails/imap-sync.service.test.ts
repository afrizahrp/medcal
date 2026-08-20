import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { ImapSyncService } from "./imap-sync.service";
import { LeadSuggestionService } from "./lead-suggestion.service";
import type { FetchedImapMessage } from "./imap-client";

const suggestions = new LeadSuggestionService();
const service = new ImapSyncService(suggestions);
const companyId = "PKM";
const createdEmailIds: string[] = [];
const createdLeadIds: string[] = [];

function imapEnv() {
  process.env.IMAP_HOST ??= "imap.example.com";
  process.env.IMAP_USER ??= "inbox@example.com";
  process.env.IMAP_PASS ??= "test-pass-not-real";
}

function msg(overrides: Partial<FetchedImapMessage> = {}): FetchedImapMessage {
  return {
    messageId: `<${randomUUID()}@example.com>`,
    fromEmail: `from-${randomUUID().slice(0, 8)}@example.com`,
    fromName: "From",
    toEmail: "inbox@example.com",
    toName: null,
    ccEmail: null,
    subject: "Hello",
    body: "<p>Hi</p>",
    textBody: "Hi",
    rfcInReplyTo: null,
    rfcReferences: null,
    receivedAt: new Date(),
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.email.deleteMany({ where: { id: { in: createdEmailIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
});

describe("ImapSyncService", () => {
  it("persists a new INBOX message with suggestion only (leadId stays null)", async () => {
    imapEnv();
    const fromEmail = `imap-${randomUUID().slice(0, 8)}@example.com`;
    const lead = await prisma.lead.create({
      data: { companyId, name: "IMAP Lead", email: fromEmail },
    });
    createdLeadIds.push(lead.id);

    const incoming = msg({ fromEmail });
    const result = await service.syncInbox(companyId, async () => [incoming]);
    expect(result.created).toBe(1);
    expect(result.duplicates).toBe(0);

    const stored = await prisma.email.findFirst({ where: { companyId, messageId: incoming.messageId } });
    expect(stored).toBeTruthy();
    createdEmailIds.push(stored!.id);
    expect(stored!.folder).toBe("INBOX");
    expect(stored!.suggestedLeadId).toBe(lead.id);
    expect(stored!.leadId).toBeNull();
  });

  it("skips duplicates by messageId", async () => {
    imapEnv();
    const incoming = msg();
    const first = await service.syncInbox(companyId, async () => [incoming]);
    const row = await prisma.email.findFirst({ where: { companyId, messageId: incoming.messageId } });
    createdEmailIds.push(row!.id);
    expect(first.created).toBe(1);

    const second = await service.syncInbox(companyId, async () => [incoming]);
    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it("limits fetch to the last 50 via the client (batch of 2 here creates 2)", async () => {
    imapEnv();
    const batch = [msg(), msg()];
    const result = await service.syncInbox(companyId, async () => batch);
    expect(result.fetched).toBe(2);
    expect(result.created).toBe(2);
    const rows = await prisma.email.findMany({
      where: { companyId, messageId: { in: batch.map((m) => m.messageId!) } },
    });
    createdEmailIds.push(...rows.map((r) => r.id));
  });

  it("skips malformed messages without fromEmail", async () => {
    imapEnv();
    const result = await service.syncInbox(companyId, async () => [msg({ fromEmail: "" })]);
    expect(result.created).toBe(0);
    expect(result.skippedMalformed).toBe(1);
  });

  it("surfaces IMAP failures without leaking secrets", async () => {
    imapEnv();
    await expect(
      service.syncInbox(companyId, async () => {
        throw new Error("auth failed for user secret-password");
      }),
    ).rejects.toMatchObject({
      status: 502,
      response: { code: "IMAP_SYNC_FAILED" },
    });
  });
});
