import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";
import { LeadsService } from "../leads/leads.service";

// Real Postgres — same convention as the other contact-messages test files.
// Covers the corrective patch (2026-08-16): POSSIBLE MATCH → Needs Review →
// staff resolution (attach / create new), concurrency safety.

const contactMessages = new ContactMessagesService();
const leads = new LeadsService();
const realCompanyId = "PKM";
const createdMessageIds: string[] = [];
const createdLeadIds: string[] = [];
let activeTopicId: number;

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    getFrom: "CONTACTFORM",
    name: "Needs Review Test",
    email: `nr-${randomUUID().slice(0, 8)}@example.com`,
    message: "Butuh kalibrasi alat.",
    topicId: activeTopicId,
    ...overrides,
  };
}

// Unique per call — must never collide across tests/runs, or a "should be
// NO MATCH" message could accidentally phone-match a Lead left over from
// another test and turn into a POSSIBLE MATCH instead.
function uniquePhone() {
  return `0814${Math.floor(Math.random() * 100000000)
    .toString()
    .padStart(8, "0")}`;
}

async function create(payload: Record<string, unknown>) {
  const result = await contactMessages.create(realCompanyId, payload);
  createdMessageIds.push(result.id);
  return result;
}

async function makePossibleMatchPair() {
  const phone = uniquePhone();
  const org = `NR-Org-${randomUUID().slice(0, 8)}`;
  const first = await create(basePayload({ phone, organizationName: org }));
  createdLeadIds.push(first.leadId!);
  // Phone matches, organization does not — POSSIBLE MATCH, leadId null.
  const second = await create(basePayload({ phone, organizationName: `${org}-different` }));
  return { existingLeadId: first.leadId!, unresolvedMessageId: second.id };
}

beforeAll(async () => {
  const topic = await prisma.contactTopic.findFirst({ where: { isActive: true } });
  if (!topic) throw new Error("Expected at least one active ContactTopic to be seeded already");
  activeTopicId = topic.id;
});

afterAll(async () => {
  await prisma.contactMessage.deleteMany({ where: { id: { in: createdMessageIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds.filter((id): id is string => Boolean(id)) } } });
});

describe("LeadsService.findNeedsReview", () => {
  it("surfaces a POSSIBLE MATCH message with its candidate Lead", async () => {
    const { existingLeadId, unresolvedMessageId } = await makePossibleMatchPair();

    const items = await leads.findNeedsReview(realCompanyId);
    const item = items.find((i) => i.message.id === unresolvedMessageId);

    expect(item).toBeDefined();
    expect(item!.message.leadId).toBeNull();
    expect(item!.candidates.some((c) => c.id === existingLeadId)).toBe(true);
  });

  it("does not include resolved (leadId set) or genuinely no-match messages", async () => {
    const resolved = await create(
      basePayload({ phone: uniquePhone(), organizationName: `NR-NoMatch-${randomUUID().slice(0, 8)}` }),
    );
    createdLeadIds.push(resolved.leadId!);

    const items = await leads.findNeedsReview(realCompanyId);
    expect(items.some((i) => i.message.id === resolved.id)).toBe(false);
  });
});

describe("ContactMessagesService.resolveLeadMatch — Attach", () => {
  it("attaches the Needs Review message to the chosen existing Lead, without altering LeadStatus", async () => {
    const { existingLeadId, unresolvedMessageId } = await makePossibleMatchPair();
    const before = await prisma.lead.findUniqueOrThrow({ where: { id: existingLeadId } });

    const updated = await contactMessages.resolveLeadMatch(realCompanyId, unresolvedMessageId, {
      action: "ATTACH",
      leadId: existingLeadId,
    });

    expect(updated.leadId).toBe(existingLeadId);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: existingLeadId } });
    expect(after.status).toBe(before.status);

    // No duplicate ContactMessage was created — same row was updated.
    const messageCount = await prisma.contactMessage.count({ where: { id: unresolvedMessageId } });
    expect(messageCount).toBe(1);
  });

  it("rejects attaching to a Lead in a different company (cross-tenant)", async () => {
    const { unresolvedMessageId } = await makePossibleMatchPair();
    const otherCompanyId = `V${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other4", status: "ACTIVE" } });
    const otherLead = await prisma.lead.create({
      data: { companyId: otherCompanyId, name: "Foreign4", email: "foreign4@example.com" },
    });

    await expect(
      contactMessages.resolveLeadMatch(realCompanyId, unresolvedMessageId, {
        action: "ATTACH",
        leadId: otherLead.id,
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: "LEAD_NOT_FOUND" } });

    await prisma.lead.delete({ where: { id: otherLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });

  it("rejects resolving a message that is already linked (concurrency-safe, no silent reassignment)", async () => {
    const { existingLeadId, unresolvedMessageId } = await makePossibleMatchPair();

    await contactMessages.resolveLeadMatch(realCompanyId, unresolvedMessageId, {
      action: "ATTACH",
      leadId: existingLeadId,
    });

    // A second attempt to resolve the same (now-linked) message must fail,
    // not silently overwrite the existing link.
    const anotherLead = await prisma.lead.create({
      data: { companyId: realCompanyId, name: "Another", email: `another-${randomUUID().slice(0, 8)}@example.com` },
    });
    createdLeadIds.push(anotherLead.id);

    await expect(
      contactMessages.resolveLeadMatch(realCompanyId, unresolvedMessageId, {
        action: "ATTACH",
        leadId: anotherLead.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const stillLinkedToFirst = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: unresolvedMessageId },
    });
    expect(stillLinkedToFirst.leadId).toBe(existingLeadId);
  });
});

describe("ContactMessagesService.resolveLeadMatch — Create New Lead", () => {
  it("creates exactly one new Lead and attaches the message, without creating a duplicate ContactMessage", async () => {
    const { unresolvedMessageId } = await makePossibleMatchPair();

    const updated = await contactMessages.resolveLeadMatch(realCompanyId, unresolvedMessageId, {
      action: "CREATE_NEW",
    });

    expect(updated.leadId).toBeTruthy();
    createdLeadIds.push(updated.leadId!);

    // Scoped to this specific message id (not a companyId-wide count) so
    // this assertion is safe under parallel test-file execution against the
    // same shared Postgres database.
    const messageCount = await prisma.contactMessage.count({ where: { id: unresolvedMessageId } });
    expect(messageCount).toBe(1);

    const newLead = await prisma.lead.findUniqueOrThrow({ where: { id: updated.leadId! } });
    expect(newLead.status).toBe("NEW");
  });
});
