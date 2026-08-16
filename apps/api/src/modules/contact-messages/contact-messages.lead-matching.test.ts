import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";

// Real Postgres — same convention as contact-messages.service.test.ts.

const service = new ContactMessagesService();
const realCompanyId = "PKM";
const createdMessageIds: string[] = [];
const createdLeadIds: string[] = [];
let activeTopicId: number;

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    getFrom: "CONTACTFORM",
    name: "Matching Test",
    email: `match-${randomUUID().slice(0, 8)}@example.com`,
    message: "Butuh kalibrasi alat.",
    topicId: activeTopicId,
    ...overrides,
  };
}

async function create(payload: Record<string, unknown>) {
  const result = await service.create(realCompanyId, payload);
  createdMessageIds.push(result.id);
  return result;
}

beforeAll(async () => {
  const topic = await prisma.contactTopic.findFirst({ where: { isActive: true } });
  if (!topic) throw new Error("Expected at least one active ContactTopic to be seeded already");
  activeTopicId = topic.id;
});

afterAll(async () => {
  await prisma.contactMessage.deleteMany({ where: { id: { in: createdMessageIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
});

describe("ContactMessagesService.create — Lead identity matching (Lead Inbox, locked 2026-08-16 §4/§10, corrected 2026-08-16)", () => {
  it("NO MATCH: creates a new Lead when nothing matches", async () => {
    const result = await create(
      basePayload({ phone: "081100000001", organizationName: `Org-${randomUUID().slice(0, 8)}` }),
    );
    expect(result.leadId).toBeTruthy();
    createdLeadIds.push(result.leadId!);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId! } });
    expect(lead.companyId).toBe(realCompanyId);
    expect(lead.status).toBe("NEW");
  });

  it("STRONG MATCH: normalized phone + normalized organization both match an existing Lead → auto-attaches, no new Lead created", async () => {
    const org = `RS Strong Match ${randomUUID().slice(0, 8)}`;
    const first = await create(basePayload({ phone: "0812-3456-7890", organizationName: org }));
    createdLeadIds.push(first.leadId!);

    // Same phone in a different format, same organization (different case/whitespace) —
    // exact-normalized-match only, no fuzzy matching.
    const second = await create(
      basePayload({ phone: "+62 812 3456 7890", organizationName: `  ${org.toUpperCase()}  ` }),
    );

    expect(second.leadId).toBe(first.leadId);

    const leadCount = await prisma.contactMessage.count({ where: { leadId: first.leadId! } });
    expect(leadCount).toBe(2);
  });

  it("POSSIBLE MATCH (phone matches, organization does not): does NOT auto-attach and does NOT create a new Lead — leadId stays null", async () => {
    const first = await create(
      basePayload({ phone: "081234567891", organizationName: `Org-A-${randomUUID().slice(0, 8)}` }),
    );
    createdLeadIds.push(first.leadId!);

    const second = await create(
      basePayload({ phone: "081234567891", organizationName: `Org-B-${randomUUID().slice(0, 8)}` }),
    );

    expect(second.leadId).toBeNull();
  });

  it("POSSIBLE MATCH (organization matches, phone does not): does NOT auto-attach and does NOT create a new Lead — leadId stays null", async () => {
    const org = `Org-Shared-${randomUUID().slice(0, 8)}`;
    const first = await create(basePayload({ phone: "081200000010", organizationName: org }));
    createdLeadIds.push(first.leadId!);

    const second = await create(basePayload({ phone: "081200000011", organizationName: org }));

    expect(second.leadId).toBeNull();
  });

  it("multiple STRONG candidates (ambiguous): degrades to POSSIBLE — does not auto-attach to either, does not create a new Lead", async () => {
    const phone = "081277777777";
    const org = `Org-Dup-${randomUUID().slice(0, 8)}`;

    const first = await create(basePayload({ phone, organizationName: org }));
    createdLeadIds.push(first.leadId!);
    // Directly create a second Lead with the same identity to force ambiguity
    // (simulates two independently-created Leads that happen to collide).
    const duplicateLead = await prisma.lead.create({
      data: { companyId: realCompanyId, name: "Dup", email: "dup@example.com", phone, organizationName: org },
    });
    createdLeadIds.push(duplicateLead.id);

    const third = await create(basePayload({ phone, organizationName: org }));

    expect(third.leadId).toBeNull();
  });

  it("no phone and no organization on the new message: creates a new Lead (nothing to compare)", async () => {
    const result = await create(basePayload({ phone: undefined, organizationName: undefined }));
    createdLeadIds.push(result.leadId!);
    expect(result.leadId).toBeTruthy();
  });

  it("tenant isolation: a STRONG MATCH candidate in a different company never auto-attaches across companies", async () => {
    const otherCompanyId = `Z${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Other Co", status: "ACTIVE" },
    });
    const org = `Cross-Tenant-${randomUUID().slice(0, 8)}`;
    // Unique per run — a hardcoded literal here previously collided with real
    // Lead data created during manual trial testing in this same dev
    // database, producing a false POSSIBLE MATCH and breaking this test.
    const phone = `0815${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0")}`;

    const otherLead = await prisma.lead.create({
      data: { companyId: otherCompanyId, name: "Other", email: "other@example.com", phone, organizationName: org },
    });

    const result = await create(basePayload({ phone, organizationName: org }));
    createdLeadIds.push(result.leadId!);

    expect(result.leadId).not.toBe(otherLead.id);

    await prisma.lead.delete({ where: { id: otherLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });
});
