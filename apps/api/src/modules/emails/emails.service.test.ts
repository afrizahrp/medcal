import { randomUUID } from "node:crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { EmailsService } from "./emails.service";
import { ImapSyncService } from "./imap-sync.service";
import { LeadSuggestionService } from "./lead-suggestion.service";

const suggestions = new LeadSuggestionService();
const imapSync = new ImapSyncService(suggestions);
const service = new EmailsService(suggestions, imapSync);
const companyId = "PKM";
const createdEmailIds: string[] = [];
const createdLeadIds: string[] = [];
let senderUserId: string;

function smtpEnv() {
  process.env.SMTP_HOST ??= "smtp.example.com";
  process.env.SMTP_USER ??= "info@example.com";
  process.env.SMTP_PASS ??= "test-pass-not-real";
  process.env.SMTP_FROM ??= "MedCal <info@example.com>";
  process.env.SMTP_SECURE ??= "true";
}

beforeAll(async () => {
  const user = await prisma.user.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
  if (!user) throw new Error("Expected an ACTIVE user");
  senderUserId = user.id;
  smtpEnv();
});

afterAll(async () => {
  await prisma.email.deleteMany({ where: { id: { in: createdEmailIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
});

async function makeEmail(overrides: Record<string, unknown> = {}) {
  const email = await prisma.email.create({
    data: {
      companyId,
      fromEmail: "a@example.com",
      toEmail: "b@example.com",
      subject: "Subj",
      body: "Body",
      folder: "INBOX",
      ...overrides,
    },
  });
  createdEmailIds.push(email.id);
  return email;
}

describe("EmailsService tenant isolation", () => {
  it("does not return another company's email by id", async () => {
    const otherCompanyId = `Y${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other", status: "ACTIVE" } });
    const foreign = await prisma.email.create({
      data: {
        companyId: otherCompanyId,
        fromEmail: "x@example.com",
        toEmail: "y@example.com",
        subject: "Foreign",
        body: "nope",
        folder: "INBOX",
      },
    });
    await expect(service.findOne(companyId, foreign.id)).rejects.toBeInstanceOf(NotFoundException);
    await prisma.email.delete({ where: { id: foreign.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });

  it("cannot associate a Lead from another company", async () => {
    const email = await makeEmail();
    const otherCompanyId = `Z${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other2", status: "ACTIVE" } });
    const foreignLead = await prisma.lead.create({
      data: { companyId: otherCompanyId, name: "Foreign", email: "foreign@example.com" },
    });
    await expect(service.associateLead(companyId, email.id, foreignLead.id)).rejects.toMatchObject({
      response: { code: "LEAD_NOT_FOUND" },
    });
    await prisma.lead.delete({ where: { id: foreignLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });
});

describe("EmailsService lead association", () => {
  it("confirms a suggestion, allows change, and remove; never auto-assigns", async () => {
    const email = await makeEmail({ leadId: null, suggestedLeadId: null });
    expect(email.leadId).toBeNull();

    const leadA = await prisma.lead.create({
      data: { companyId, name: "A", email: `a-${randomUUID().slice(0, 8)}@example.com` },
    });
    const leadB = await prisma.lead.create({
      data: { companyId, name: "B", email: `b-${randomUUID().slice(0, 8)}@example.com` },
    });
    createdLeadIds.push(leadA.id, leadB.id);

    const confirmed = await service.associateLead(companyId, email.id, leadA.id);
    expect(confirmed.leadId).toBe(leadA.id);
    expect(confirmed.suggestedLeadId).toBeNull();

    const changed = await service.associateLead(companyId, email.id, leadB.id);
    expect(changed.leadId).toBe(leadB.id);

    const removed = await service.associateLead(companyId, email.id, null);
    expect(removed.leadId).toBeNull();
  });

  it("rejects lead association without email:manage at update()", async () => {
    const email = await makeEmail();
    const lead = await prisma.lead.create({
      data: { companyId, name: "C", email: `c-${randomUUID().slice(0, 8)}@example.com` },
    });
    createdLeadIds.push(lead.id);
    await expect(
      service.update(companyId, "CUSTOMER", email.id, { leadId: lead.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("EmailsService SMTP send/reply", () => {
  it("persists SENT with RFC Message-ID on success", async () => {
    service.mailer = {
      sendEmail: async () => ({ messageId: "<sent-1@example.com>", accepted: ["to@example.com"], rejected: [] }),
    };
    const sent = await service.send(companyId, senderUserId, {
      to: "to@example.com",
      subject: "Hello",
      body: "Hi there",
    });
    createdEmailIds.push(sent.id);
    expect(sent.folder).toBe("SENT");
    expect(sent.messageId).toBe("<sent-1@example.com>");
    expect(sent.sentByUserId).toBe(senderUserId);
    expect(sent.leadId).toBeNull();
  });

  it("does not persist SENT when SMTP fails", async () => {
    service.mailer = {
      sendEmail: async () => {
        throw new Error("connection refused");
      },
    };
    const before = await prisma.email.count({ where: { companyId, folder: "SENT", subject: "WillFail" } });
    await expect(
      service.send(companyId, senderUserId, { to: "to@example.com", subject: "WillFail", body: "x" }),
    ).rejects.toMatchObject({ response: { code: "SMTP_DELIVERY_FAILED" } });
    const after = await prisma.email.count({ where: { companyId, folder: "SENT", subject: "WillFail" } });
    expect(after).toBe(before);
  });

  it("sets parentEmailId to MedCal id and rfcInReplyTo to parent RFC messageId", async () => {
    service.mailer = {
      sendEmail: async (input) => {
        expect(input.inReplyTo).toBe("<parent-rfc@example.com>");
        expect(input.references).toContain("<parent-rfc@example.com>");
        expect(input.inReplyTo).not.toMatch(/^c/);
        return { messageId: "<reply@example.com>", accepted: ["a@example.com"], rejected: [] };
      },
    };
    const parent = await makeEmail({
      messageId: "<parent-rfc@example.com>",
      rfcReferences: "<older@example.com>",
    });
    const reply = await service.send(companyId, senderUserId, {
      to: "a@example.com",
      subject: "Re: Subj",
      body: "reply",
      parentEmailId: parent.id,
    });
    createdEmailIds.push(reply.id);
    expect(reply.parentEmailId).toBe(parent.id);
    expect(reply.rfcInReplyTo).toBe("<parent-rfc@example.com>");
    expect(reply.rfcReferences).toContain("<parent-rfc@example.com>");
  });
});

describe("EmailsService drafts and trash", () => {
  it("creates, updates, and sends a local draft", async () => {
    service.mailer = {
      sendEmail: async () => ({ messageId: "<draft-sent@example.com>", accepted: ["z@example.com"], rejected: [] }),
    };
    const draft = await service.saveDraft(companyId, senderUserId, { subject: "Draft", body: "wip" });
    createdEmailIds.push(draft.id);
    expect(draft.folder).toBe("DRAFTS");

    const updated = await service.updateDraft(companyId, draft.id, {
      to: "z@example.com",
      subject: "Draft ready",
      body: "go",
    });
    expect(updated.toEmail).toBe("z@example.com");

    const sent = await service.sendDraft(companyId, senderUserId, draft.id);
    createdEmailIds.push(sent.id);
    expect(sent.folder).toBe("SENT");
    expect(await prisma.email.findUnique({ where: { id: draft.id } })).toBeNull();
  });

  it("soft-deletes to trash and restores original folder", async () => {
    const email = await makeEmail({ folder: "INBOX" });
    const trashed = await service.moveToTrash(companyId, email.id);
    expect(trashed.deletedAt).toBeTruthy();
    expect(trashed.folder).toBe("INBOX");

    const listed = await service.findAll(companyId, { folder: "TRASH", search: email.subject });
    expect(listed.data.some((r) => r.id === email.id)).toBe(true);

    const restored = await service.restore(companyId, email.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.folder).toBe("INBOX");
  });

  it("marks read/unread with email:read (no manage required)", async () => {
    const email = await makeEmail({ status: "UNREAD" });
    const read = await service.update(companyId, "ADMIN", email.id, { status: "READ" });
    expect(read.status).toBe("READ");
    expect(read.readAt).toBeTruthy();
  });
});

describe("EmailsService confirmed lead history", () => {
  it("lists only emails with confirmed leadId for a lead", async () => {
    const lead = await prisma.lead.create({
      data: { companyId, name: "Hist", email: `h-${randomUUID().slice(0, 8)}@example.com` },
    });
    createdLeadIds.push(lead.id);
    const confirmed = await makeEmail({ leadId: lead.id, suggestedLeadId: null });
    const suggestedOnly = await makeEmail({ leadId: null, suggestedLeadId: lead.id });

    const list = await service.listForLead(companyId, lead.id);
    expect(list.data.map((r) => r.id)).toContain(confirmed.id);
    expect(list.data.map((r) => r.id)).not.toContain(suggestedOnly.id);
  });
});
