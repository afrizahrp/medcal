import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "../contact-messages/contact-messages.service";
import { ChatSessionsService } from "./chat-sessions.service";

// Real Postgres, same convention as leads.service.test.ts /
// contact-messages.service.test.ts — no mocking.

const service = new ChatSessionsService(new ContactMessagesService());
const realCompanyId = "PKM";
const createdSessionIds: string[] = [];
const createdContactMessageIds: string[] = [];
const createdLeadIds: string[] = [];

async function createSession(overrides: Record<string, unknown> = {}) {
  const result = await service.createSession(realCompanyId, {
    name: "Chat Visitor",
    email: `chat-${randomUUID().slice(0, 8)}@example.com`,
    message: "Halo, saya butuh info kalibrasi.",
    ...overrides,
  });
  createdSessionIds.push(result.id);
  if (result.contactMessageId) createdContactMessageIds.push(result.contactMessageId);
  return result;
}

// countUnread's before/after assertions read a company-wide COUNT, which
// realCompanyId ("PKM") cannot safely support — vitest runs test FILES in
// parallel, and chat.gateway.security.test.ts also creates ChatSessions for
// "PKM" concurrently, so a global count taken there is inherently racy. A
// dedicated throwaway company (untouched by every other test file) makes
// those counts deterministic. Company.id is `@db.Char(3)`, same constraint
// as "PKM".
const countCompanyId = "CHT";
const countCompanySessionIds: string[] = [];
const countCompanyContactMessageIds: string[] = [];

async function createSessionForCompany(companyId: string, overrides: Record<string, unknown> = {}) {
  const result = await service.createSession(companyId, {
    name: "Chat Visitor",
    email: `chat-${randomUUID().slice(0, 8)}@example.com`,
    message: "Halo, saya butuh info kalibrasi.",
    ...overrides,
  });
  countCompanySessionIds.push(result.id);
  if (result.contactMessageId) countCompanyContactMessageIds.push(result.contactMessageId);
  return result;
}

beforeAll(async () => {
  await prisma.company.upsert({
    where: { id: countCompanyId },
    create: { id: countCompanyId, name: "Unread Count Test Co", status: "ACTIVE" },
    update: {},
  });
});

afterAll(async () => {
  await prisma.chatMessage.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
  await prisma.chatSession.deleteMany({ where: { id: { in: createdSessionIds } } });
  await prisma.contactMessage.deleteMany({ where: { id: { in: createdContactMessageIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
  // Cascade-deletes any leftover ChatSession/ChatMessage/ContactMessage rows
  // under this company too (Company -> ChatSession/ContactMessage is
  // onDelete: Cascade).
  await prisma.company.delete({ where: { id: countCompanyId } }).catch(() => {});
});

describe("ChatSessionsService.createSession", () => {
  it("creates a session with a valid name/email/message", async () => {
    const email = `visitor-${randomUUID().slice(0, 8)}@example.com`;
    const result = await createSession({ name: "Budi", email, message: "Halo" });

    expect(result.visitorName).toBe("Budi");
    expect(result.visitorEmail).toBe(email);
    expect(result.status).toBe("OPEN");
    expect(result.closedAt).toBeNull();
  });

  it("persists the first message as a VISITOR ChatMessage", async () => {
    const result = await createSession({ message: "Pesan pertama" });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.senderType).toBe("VISITOR");
    expect(result.messages[0]!.body).toBe("Pesan pertama");

    const stored = await prisma.chatMessage.findMany({ where: { sessionId: result.id } });
    expect(stored).toHaveLength(1);
  });

  it("rejects a message exceeding the 2000-char max length", async () => {
    await expect(
      service.createSession(realCompanyId, {
        name: "Too Long",
        email: `long-${randomUUID().slice(0, 8)}@example.com`,
        message: "x".repeat(2001),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a message at exactly the 2000-char boundary", async () => {
    const result = await createSession({ message: "x".repeat(2000) });
    expect(result.messages[0]!.body).toHaveLength(2000);
  });

  it("rejects a missing name", async () => {
    await expect(
      service.createSession(realCompanyId, {
        email: `noname-${randomUUID().slice(0, 8)}@example.com`,
        message: "Halo",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a missing email", async () => {
    await expect(
      service.createSession(realCompanyId, { name: "No Email", message: "Halo" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a missing message", async () => {
    await expect(
      service.createSession(realCompanyId, {
        name: "No Message",
        email: `nomsg-${randomUUID().slice(0, 8)}@example.com`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not require or accept phone/organizationName as part of the schema", async () => {
    // Extra fields (if a caller sent them) are simply not part of the parsed
    // shape — the created Lead/ContactMessage must show no phone/org came
    // from this path.
    const result = await createSession({ message: "Tanpa nomor telepon" });
    const contactMessage = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: result.contactMessageId! },
    });
    expect(contactMessage.phone).toBeNull();
    expect(contactMessage.organizationName).toBeNull();
  });

  it("creates exactly one ContactMessage per session, with getFrom=CHAT_PERSON, and links it via contactMessageId", async () => {
    const result = await createSession();

    expect(result.contactMessageId).toBeTruthy();
    const contactMessage = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: result.contactMessageId! },
    });
    expect(contactMessage.getFrom).toBe("CHAT_PERSON");
    expect(contactMessage.companyId).toBe(realCompanyId);

    const countLinked = await prisma.contactMessage.count({
      where: { id: result.contactMessageId! },
    });
    expect(countLinked).toBe(1);

    const sessionsLinkedToThisMessage = await prisma.chatSession.count({
      where: { contactMessageId: result.contactMessageId! },
    });
    expect(sessionsLinkedToThisMessage).toBe(1);
  });

  it("invokes the existing Lead matching pipeline — NO MATCH creates a new Lead", async () => {
    const result = await createSession();
    const contactMessage = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: result.contactMessageId! },
    });
    expect(contactMessage.leadId).toBeTruthy();
    createdLeadIds.push(contactMessage.leadId!);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: contactMessage.leadId! } });
    expect(lead.companyId).toBe(realCompanyId);
  });

  it("Web Chat cannot produce a STRONG match — no phone/organizationName is ever supplied, so leadId is either a NEW lead or null (POSSIBLE), never an auto-attach requiring phone+org", async () => {
    // Two sessions with the exact same email but nothing else in common —
    // STRONG requires phone AND organizationName; Web Chat supplies
    // neither, so this can only ever be POSSIBLE (email-only signal) or a
    // fresh NONE, never STRONG.
    const email = `possible-${randomUUID().slice(0, 8)}@example.com`;
    const first = await createSession({ email, name: "First Contact" });
    const firstMessage = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: first.contactMessageId! },
    });
    if (firstMessage.leadId) createdLeadIds.push(firstMessage.leadId);

    const second = await createSession({ email, name: "Second Contact" });
    const secondMessage = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: second.contactMessageId! },
    });

    // POSSIBLE match (email-only signal) never auto-attaches.
    expect(secondMessage.leadId).toBeNull();
  });
});

describe("ChatSessionsService.createSession — transaction atomicity (corrected 2026-08-16)", () => {
  it("rolls back ChatSession and the first ChatMessage if ContactMessage creation fails", async () => {
    const spy = vi
      .spyOn(ContactMessagesService.prototype, "create")
      .mockRejectedValueOnce(new Error("Simulated ContactMessage failure"));

    const email = `rollback-a-${randomUUID().slice(0, 8)}@example.com`;
    const uniqueBody = `Rollback marker A ${randomUUID()}`;

    await expect(
      service.createSession(realCompanyId, { name: "Rollback A", email, message: uniqueBody }),
    ).rejects.toThrow("Simulated ContactMessage failure");

    spy.mockRestore();

    const sessions = await prisma.chatSession.findMany({ where: { visitorEmail: email } });
    expect(sessions).toHaveLength(0);

    const messages = await prisma.chatMessage.findMany({ where: { body: uniqueBody } });
    expect(messages).toHaveLength(0);
  });

  it("rolls back everything — including the newly-created ContactMessage — if linking ChatSession.contactMessageId fails", async () => {
    const linkSpy = vi
      .spyOn(ChatSessionsService.prototype as unknown as { linkContactMessage: () => unknown }, "linkContactMessage")
      .mockRejectedValueOnce(new Error("Simulated link failure"));

    const email = `rollback-b-${randomUUID().slice(0, 8)}@example.com`;
    const uniqueBody = `Rollback marker B ${randomUUID()}`;

    await expect(
      service.createSession(realCompanyId, { name: "Rollback B", email, message: uniqueBody }),
    ).rejects.toThrow("Simulated link failure");

    linkSpy.mockRestore();

    const sessions = await prisma.chatSession.findMany({ where: { visitorEmail: email } });
    expect(sessions).toHaveLength(0);

    const messages = await prisma.chatMessage.findMany({ where: { body: uniqueBody } });
    expect(messages).toHaveLength(0);

    // The critical assertion: ContactMessagesService.create() DID run (and
    // would have committed a ContactMessage + possibly a new Lead) before
    // the link step failed — proving those writes were rolled back too,
    // not just the two ChatSession-domain rows.
    const contactMessages = await prisma.contactMessage.findMany({
      where: { email, message: uniqueBody },
    });
    expect(contactMessages).toHaveLength(0);
  });

  it("on success: ChatSession, first ChatMessage, and exactly one linked ContactMessage all exist together", async () => {
    const result = await createSession();

    const session = await prisma.chatSession.findUniqueOrThrow({ where: { id: result.id } });
    expect(session.contactMessageId).toBe(result.contactMessageId);

    const messages = await prisma.chatMessage.findMany({ where: { sessionId: result.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.senderType).toBe("VISITOR");

    const contactMessages = await prisma.contactMessage.count({
      where: { id: result.contactMessageId! },
    });
    expect(contactMessages).toBe(1);
  });
});

describe("ChatSessionsService.createSession — security: client input cannot control companyId/tenant/getFrom", () => {
  it("ignores a companyId/tenant-shaped value embedded in the raw body — only the companyId argument (guard-derived) is used", async () => {
    const email = `trust-${randomUUID().slice(0, 8)}@example.com`;
    const result = await service.createSession(realCompanyId, {
      name: "Trust Test",
      email,
      message: "Halo",
      companyId: "NOT-A-REAL-COMPANY",
      tenantId: "NOT-A-REAL-COMPANY",
    });
    createdSessionIds.push(result.id);
    if (result.contactMessageId) createdContactMessageIds.push(result.contactMessageId);

    expect(result.companyId).toBe(realCompanyId);
    const stored = await prisma.chatSession.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored.companyId).toBe(realCompanyId);
  });

  it("ignores a client-supplied getFrom — the resulting ContactMessage always uses CHAT_PERSON regardless", async () => {
    const email = `getfrom-${randomUUID().slice(0, 8)}@example.com`;
    const result = await service.createSession(realCompanyId, {
      name: "GetFrom Test",
      email,
      message: "Halo",
      getFrom: "WHATSAPP",
    });
    createdSessionIds.push(result.id);
    if (result.contactMessageId) createdContactMessageIds.push(result.contactMessageId);

    const contactMessage = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: result.contactMessageId! },
    });
    expect(contactMessage.getFrom).toBe("CHAT_PERSON");
  });
});

describe("ChatSessionsService.addMessage", () => {
  it("persists a subsequent VISITOR message", async () => {
    const session = await createSession();
    const message = await service.addMessage(realCompanyId, session.id, {
      senderType: "VISITOR",
      body: "Follow-up dari visitor",
    });
    expect(message.senderType).toBe("VISITOR");
    expect(message.sessionId).toBe(session.id);
  });

  it("persists an ADMIN message", async () => {
    const session = await createSession();
    const message = await service.addMessage(realCompanyId, session.id, {
      senderType: "ADMIN",
      body: "Balasan dari admin",
    });
    expect(message.senderType).toBe("ADMIN");
  });

  it("orders messages deterministically by seq, not by re-reading createdAt", async () => {
    const session = await createSession();
    await service.addMessage(realCompanyId, session.id, { senderType: "ADMIN", body: "Kedua" });
    await service.addMessage(realCompanyId, session.id, { senderType: "VISITOR", body: "Ketiga" });

    const messages = await service.findMessages(realCompanyId, session.id);
    expect(messages.map((m) => m.body)).toEqual([
      session.messages[0]!.body,
      "Kedua",
      "Ketiga",
    ]);
    expect(messages[0]!.seq < messages[1]!.seq).toBe(true);
    expect(messages[1]!.seq < messages[2]!.seq).toBe(true);
  });

  it("rejects a message exceeding 2000 characters", async () => {
    const session = await createSession();
    await expect(
      service.addMessage(realCompanyId, session.id, { senderType: "VISITOR", body: "x".repeat(2001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects sending to a session in a different company", async () => {
    const session = await createSession();
    await expect(
      service.addMessage("ZZZ-UNKNOWN", session.id, { senderType: "VISITOR", body: "hi" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("duplicate clientMessageId within the same session does not create a duplicate message", async () => {
    const session = await createSession();
    const clientMessageId = randomUUID();

    const first = await service.addMessage(realCompanyId, session.id, {
      senderType: "VISITOR",
      body: "Original",
      clientMessageId,
    });
    const retry = await service.addMessage(realCompanyId, session.id, {
      senderType: "VISITOR",
      body: "Original",
      clientMessageId,
    });

    expect(retry.id).toBe(first.id);
    const count = await prisma.chatMessage.count({ where: { sessionId: session.id, clientMessageId } });
    expect(count).toBe(1);
  });

  it("the same clientMessageId in two different sessions does not collide", async () => {
    const sessionA = await createSession();
    const sessionB = await createSession();
    const clientMessageId = randomUUID();

    const a = await service.addMessage(realCompanyId, sessionA.id, {
      senderType: "VISITOR",
      body: "A",
      clientMessageId,
    });
    const b = await service.addMessage(realCompanyId, sessionB.id, {
      senderType: "VISITOR",
      body: "B",
      clientMessageId,
    });

    expect(a.id).not.toBe(b.id);
  });
});

describe("ChatSessionsService session lifecycle", () => {
  it("starts OPEN", async () => {
    const session = await createSession();
    expect(session.status).toBe("OPEN");
  });

  it("can be closed, setting closedAt", async () => {
    const session = await createSession();
    const closed = await service.closeSession(realCompanyId, session.id);
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();
  });

  it("throws NotFoundException closing a session in a different company", async () => {
    const session = await createSession();
    await expect(service.closeSession("ZZZ-UNKNOWN", session.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("ChatSessionsService.findById / findMessages — tenant isolation", () => {
  it("findById scopes to companyId — a session cannot be read via a foreign companyId", async () => {
    const session = await createSession();
    await expect(service.findById("ZZZ-UNKNOWN", session.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const found = await service.findById(realCompanyId, session.id);
    expect(found.id).toBe(session.id);
  });

  it("findMessages scopes to companyId", async () => {
    const session = await createSession();
    await expect(service.findMessages("ZZZ-UNKNOWN", session.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("Web Chat -> Lead pipeline integration: subsequent messages never create additional ContactMessages", () => {
  it("adding VISITOR/ADMIN messages after session creation does not touch ContactMessage at all", async () => {
    const session = await createSession();
    const countBefore = await prisma.contactMessage.count({ where: { companyId: realCompanyId } });

    await service.addMessage(realCompanyId, session.id, { senderType: "VISITOR", body: "lanjutan 1" });
    await service.addMessage(realCompanyId, session.id, { senderType: "ADMIN", body: "balasan 1" });
    await service.addMessage(realCompanyId, session.id, { senderType: "VISITOR", body: "lanjutan 2" });

    const countAfter = await prisma.contactMessage.count({ where: { companyId: realCompanyId } });
    expect(countAfter).toBe(countBefore);

    const linkedCount = await prisma.contactMessage.count({
      where: { id: session.contactMessageId! },
    });
    expect(linkedCount).toBe(1);
  });
});

describe("ChatSessionsService.countUnread — Management header badge (2026-08-17 audit)", () => {
  it("a freshly created session (VISITOR message, never read) counts as unread", async () => {
    const before = await service.countUnread(countCompanyId);
    await createSessionForCompany(countCompanyId);
    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before + 1);
  });

  it("markRead clears the unread state — no VISITOR message newer than lastReadByAdminAt", async () => {
    const session = await createSessionForCompany(countCompanyId);
    const before = await service.countUnread(countCompanyId);

    await service.markRead(countCompanyId, session.id);

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before - 1);
  });

  it("an ADMIN-authored latest message does not create unread after markRead", async () => {
    const session = await createSessionForCompany(countCompanyId);
    await service.markRead(countCompanyId, session.id);
    const before = await service.countUnread(countCompanyId);

    await service.addMessage(countCompanyId, session.id, { senderType: "ADMIN", body: "Balasan admin" });

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before);
  });

  it("a VISITOR message after admin has read the session makes it unread again", async () => {
    const session = await createSessionForCompany(countCompanyId);
    await service.markRead(countCompanyId, session.id);
    await service.addMessage(countCompanyId, session.id, { senderType: "ADMIN", body: "Balasan admin" });
    const before = await service.countUnread(countCompanyId);

    await service.addMessage(countCompanyId, session.id, { senderType: "VISITOR", body: "Follow-up visitor" });

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before + 1);
  });

  it("scopes the count to the given companyId only", async () => {
    const before = await service.countUnread("ZZZ-UNKNOWN");
    await createSessionForCompany(countCompanyId);
    const after = await service.countUnread("ZZZ-UNKNOWN");
    expect(after).toBe(before);
  });
});

describe("ChatSessionsService.markRead — timing/concurrency (2026-08-17 audit fix)", () => {
  it("throws NotFoundException marking a session in a different company", async () => {
    const session = await createSessionForCompany(countCompanyId);
    await expect(service.markRead("ZZZ-UNKNOWN", session.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a malformed readUpTo", async () => {
    const session = await createSessionForCompany(countCompanyId);
    await expect(
      service.markRead(countCompanyId, session.id, { readUpTo: "not-a-date" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stamps lastReadByAdminAt to an explicit readUpTo instead of always using wall-clock now", async () => {
    const session = await createSessionForCompany(countCompanyId);
    const readUpTo = session.messages[0]!.createdAt;

    const updated = await service.markRead(countCompanyId, session.id, { readUpTo: readUpTo.toISOString() });

    expect(updated.lastReadByAdminAt).not.toBeNull();
    expect(updated.lastReadByAdminAt!.getTime()).toBe(readUpTo.getTime());
  });

  it("clamps a future readUpTo to now instead of trusting the client", async () => {
    const session = await createSessionForCompany(countCompanyId);
    const future = new Date(Date.now() + 60_000);

    const updated = await service.markRead(countCompanyId, session.id, { readUpTo: future.toISOString() });

    expect(updated.lastReadByAdminAt!.getTime()).toBeLessThan(future.getTime());
    expect(updated.lastReadByAdminAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("never regresses lastReadByAdminAt backward when an older readUpTo arrives after a newer one", async () => {
    const session = await createSessionForCompany(countCompanyId);
    const t1 = new Date();
    const t0 = new Date(t1.getTime() - 60_000);

    await service.markRead(countCompanyId, session.id, { readUpTo: t1.toISOString() });
    const updated = await service.markRead(countCompanyId, session.id, { readUpTo: t0.toISOString() });

    expect(updated.lastReadByAdminAt!.getTime()).toBe(t1.getTime());
  });

  // Gap B regression: the initial conversation fetch and the mark-read PATCH
  // are no longer racing on the frontend, but this asserts the invariant
  // that makes that fix actually work — a readUpTo snapshot taken BEFORE a
  // new VISITOR message existed must never swallow that later message, no
  // matter when the markRead request actually lands relative to it.
  it("Gap B: a readUpTo snapshot never swallows a VISITOR message created after that snapshot", async () => {
    const session = await createSessionForCompany(countCompanyId);
    const initialReadUpTo = session.messages[0]!.createdAt.toISOString();

    // A new VISITOR message arrives AFTER the snapshot was taken (simulating
    // the race window between the initial GET and the mark-read PATCH)...
    await service.addMessage(countCompanyId, session.id, { senderType: "VISITOR", body: "Race message" });

    // ...and only THEN does markRead for the ORIGINAL (now-stale) snapshot land.
    const before = await service.countUnread(countCompanyId);
    await service.markRead(countCompanyId, session.id, { readUpTo: initialReadUpTo });
    const after = await service.countUnread(countCompanyId);

    // The race message must still count as unread.
    expect(after).toBe(before);
  });

  // Gap A regression: a message actually rendered live (via the socket)
  // while the conversation is open advances the read position using its
  // own createdAt, past whatever the initial load's snapshot was.
  it("Gap A: a live VISITOR message's own createdAt advances the read position past the initial snapshot", async () => {
    const session = await createSessionForCompany(countCompanyId);
    const initialReadUpTo = session.messages[0]!.createdAt.toISOString();
    await service.markRead(countCompanyId, session.id, { readUpTo: initialReadUpTo });

    const live = await service.addMessage(countCompanyId, session.id, {
      senderType: "VISITOR",
      body: "Live message while conversation open",
    });
    const before = await service.countUnread(countCompanyId);

    await service.markRead(countCompanyId, session.id, { readUpTo: live.createdAt.toISOString() });

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before - 1);
  });

  // Do not regress: a visitor message after the admin leaves/reopens (no
  // live delivery involved at all, just a later markRead call) still
  // becomes unread again, same as the plain countUnread behavior above.
  it("a VISITOR message arriving after the admin closed the tab (no live mark-read) is unread on reopen", async () => {
    const session = await createSessionForCompany(countCompanyId);
    await service.markRead(countCompanyId, session.id);
    const before = await service.countUnread(countCompanyId);

    await service.addMessage(countCompanyId, session.id, { senderType: "VISITOR", body: "While admin was away" });

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before + 1);
  });
});
