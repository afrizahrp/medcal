import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hasPermission } from "@medcal/auth";
import { prisma } from "@medcal/db";
import { LeadSuggestionService } from "./lead-suggestion.service";

const service = new LeadSuggestionService();
const companyId = "PKM";
const createdLeadIds: string[] = [];

async function makeLead(email: string, name = "Lead") {
  const lead = await prisma.lead.create({
    data: { companyId, name, email },
  });
  createdLeadIds.push(lead.id);
  return lead;
}

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
});

describe("LeadSuggestionService", () => {
  it("suggests exactly one exact email match and never returns leadId", async () => {
    const email = `one-${randomUUID().slice(0, 8)}@example.com`;
    const lead = await makeLead(email, "Single");
    const result = await service.findSuggestion(companyId, ` ${email.toUpperCase()} `);
    expect(result.suggestedLeadId).toBe(lead.id);
    expect(result.candidates).toHaveLength(1);
  });

  it("returns no suggestion when there is no match", async () => {
    const result = await service.findSuggestion(companyId, `none-${randomUUID().slice(0, 8)}@example.com`);
    expect(result.suggestedLeadId).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });

  it("does not pick a winner when multiple exact matches exist", async () => {
    const email = `multi-${randomUUID().slice(0, 8)}@example.com`;
    await makeLead(email, "A");
    await makeLead(email, "B");
    const result = await service.findSuggestion(companyId, email);
    expect(result.suggestedLeadId).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("does not match by domain only", async () => {
    const unique = randomUUID().slice(0, 8);
    await makeLead(`person-${unique}@domain-match.example`);
    const result = await service.findSuggestion(companyId, `other-${unique}@domain-match.example`);
    expect(result.suggestedLeadId).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });
});

describe("email permissions catalog", () => {
  it("grants all four email verbs to ADMIN and none to CUSTOMER", () => {
    expect(hasPermission("ADMIN", "email", "read")).toBe(true);
    expect(hasPermission("ADMIN", "email", "send")).toBe(true);
    expect(hasPermission("ADMIN", "email", "delete")).toBe(true);
    expect(hasPermission("ADMIN", "email", "manage")).toBe(true);
    expect(hasPermission("CUSTOMER", "email", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "email", "send")).toBe(false);
    expect(hasPermission("CUSTOMER", "email", "delete")).toBe(false);
    expect(hasPermission("CUSTOMER", "email", "manage")).toBe(false);
  });

  it("does not treat send as sufficient for manage", () => {
    expect(hasPermission("ADMIN", "email", "manage")).toBe(true);
    expect(hasPermission("SUPERVISOR", "email", "send")).toBe(false);
    expect(hasPermission("SUPERVISOR", "email", "manage")).toBe(false);
  });
});
