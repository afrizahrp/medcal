import { randomUUID } from "node:crypto";
import { BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@medcal/db";
import type { NotificationDispatchService } from "../push-tokens/notification-dispatch.service";
import { CustomersService } from "../customers/customers.service";
import { LeadsService } from "./leads.service";

const notificationDispatch = {
  sendToUsers: async () => ({ tokens: 0, sent: 0, failed: 0, deactivated: 0 }),
} as NotificationDispatchService;

const customersService = new CustomersService();
const service = new LeadsService(notificationDispatch, customersService);
const realCompanyId = "PKM";
const createdLeadIds: string[] = [];
const createdContactMessageIds: string[] = [];
let activeTopicId: number;

async function makeLead(overrides: Record<string, unknown> = {}) {
  const lead = await prisma.lead.create({
    data: {
      companyId: realCompanyId,
      name: "Lead Test",
      email: `lead-${randomUUID().slice(0, 8)}@example.com`,
      ...overrides,
    },
  });
  createdLeadIds.push(lead.id);
  return lead;
}

beforeAll(async () => {
  const topic = await prisma.contactTopic.findFirst({ where: { isActive: true } });
  if (!topic) throw new Error("Expected at least one active ContactTopic to be seeded already");
  activeTopicId = topic.id;
});

afterAll(async () => {
  await prisma.contactMessage.deleteMany({ where: { id: { in: createdContactMessageIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
});

describe("LeadsService.findAll", () => {
  it("scopes results to the given companyId (tenant isolation)", async () => {
    const otherCompanyId = `Y${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other", status: "ACTIVE" } });
    const otherLead = await prisma.lead.create({
      data: { companyId: otherCompanyId, name: "Foreign Lead", email: "foreign@example.com" },
    });

    const result = await service.findAll(realCompanyId, {});
    expect(result.data.some((l) => l.id === otherLead.id)).toBe(false);

    await prisma.lead.delete({ where: { id: otherLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });

  it("filters by search across name/email/phone/organizationName", async () => {
    const needle = `Searchable-${randomUUID().slice(0, 8)}`;
    const lead = await makeLead({ organizationName: needle });

    const result = await service.findAll(realCompanyId, { search: needle });
    expect(result.data.map((l) => l.id)).toContain(lead.id);
  });

  it("filters by status", async () => {
    const lead = await makeLead({ status: "QUALIFIED" });

    const result = await service.findAll(realCompanyId, { status: "QUALIFIED" });
    expect(result.data.map((l) => l.id)).toContain(lead.id);
    expect(result.data.every((l) => l.status === "QUALIFIED")).toBe(true);
  });

  it("paginates and sorts newest-first by default", async () => {
    const result = await service.findAll(realCompanyId, { page: 1, pageSize: 1 });
    expect(result.data.length).toBeLessThanOrEqual(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
    expect(result.total).toBeGreaterThan(0);
  });
});

describe("LeadsService.findOne", () => {
  it("returns the Lead with its attached ContactMessages as a reverse-chronological timeline", async () => {
    const lead = await makeLead();
    const older = await prisma.contactMessage.create({
      data: {
        companyId: realCompanyId,
        name: "Older",
        email: "older@example.com",
        message: "first",
        topicId: activeTopicId,
        leadId: lead.id,
      },
    });
    createdContactMessageIds.push(older.id);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newer = await prisma.contactMessage.create({
      data: {
        companyId: realCompanyId,
        name: "Newer",
        email: "newer@example.com",
        message: "second",
        topicId: activeTopicId,
        leadId: lead.id,
      },
    });
    createdContactMessageIds.push(newer.id);

    const result = await service.findOne(realCompanyId, lead.id);
    expect(result.contactMessages.map((m) => m.id)).toEqual([newer.id, older.id]);
  });

  it("throws NotFoundException for a Lead belonging to a different company", async () => {
    const otherCompanyId = `X${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other2", status: "ACTIVE" } });
    const otherLead = await prisma.lead.create({
      data: { companyId: otherCompanyId, name: "Foreign", email: "foreign2@example.com" },
    });

    await expect(service.findOne(realCompanyId, otherLead.id)).rejects.toBeInstanceOf(NotFoundException);

    await prisma.lead.delete({ where: { id: otherLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });
});

describe("LeadsService.updateStatus", () => {
  it("updates LeadStatus", async () => {
    const lead = await makeLead();
    const updated = await service.updateStatus(realCompanyId, lead.id, "CONTACTED");
    expect(updated.status).toBe("CONTACTED");
  });

  it("throws NotFoundException for a Lead in a different company", async () => {
    const otherCompanyId = `W${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other3", status: "ACTIVE" } });
    const otherLead = await prisma.lead.create({
      data: { companyId: otherCompanyId, name: "Foreign3", email: "foreign3@example.com" },
    });

    await expect(
      service.updateStatus(realCompanyId, otherLead.id, "CONTACTED"),
    ).rejects.toBeInstanceOf(NotFoundException);

    await prisma.lead.delete({ where: { id: otherLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });
});

describe("LeadsService.assignToUser", () => {
  it("assigns a lead to an active company member", async () => {
    const assignee = await prisma.user.create({
      data: {
        email: `assignee-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
        name: "Assignee",
        status: "ACTIVE",
      },
    });
    await prisma.userMembership.create({
      data: { userId: assignee.id, companyId: realCompanyId, role: "ADMIN", isDefault: false },
    });

    const lead = await makeLead();
    const updated = await service.assignToUser(realCompanyId, lead.id, assignee.id);
    expect(updated.assignedToUserId).toBe(assignee.id);

    await prisma.userMembership.deleteMany({ where: { userId: assignee.id } });
    await prisma.user.delete({ where: { id: assignee.id } });
  });

  it("notifies the assignee with a generic, portal-scoped payload (no lead name)", async () => {
    const assignee = await prisma.user.create({
      data: {
        email: `assignee-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
        name: "Assignee",
        status: "ACTIVE",
      },
    });
    await prisma.userMembership.create({
      data: { userId: assignee.id, companyId: realCompanyId, role: "ADMIN", isDefault: false },
    });
    const sendToUsers = vi.fn().mockResolvedValue({ tokens: 0, sent: 0, failed: 0, deactivated: 0 });
    const spyService = new LeadsService(
      { sendToUsers } as unknown as NotificationDispatchService,
      customersService,
    );

    const lead = await makeLead({ name: "Sensitive Customer Name", organizationName: "Secret Org" });
    await spyService.assignToUser(realCompanyId, lead.id, assignee.id);

    expect(sendToUsers).toHaveBeenCalledTimes(1);
    const input = sendToUsers.mock.calls[0][0];
    expect(input.companyId).toBe(realCompanyId);
    expect(input.userIds).toEqual([assignee.id]);
    expect(input.apps).toEqual(["PORTAL", "WEB"]);
    expect(input.apps).not.toContain("TECH_PWA");
    expect(input.data).toEqual({ type: "LEAD_ASSIGNED", leadId: lead.id });
    const serialized = JSON.stringify([input.notification, input.data]);
    expect(serialized).not.toContain("Sensitive Customer Name");
    expect(serialized).not.toContain("Secret Org");
    expect(serialized).not.toContain(lead.email);

    await prisma.userMembership.deleteMany({ where: { userId: assignee.id } });
    await prisma.user.delete({ where: { id: assignee.id } });
  });

  it("keeps the committed assignment and returns success when push dispatch fails", async () => {
    const assignee = await prisma.user.create({
      data: {
        email: `assignee-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
        name: "Assignee",
        status: "ACTIVE",
      },
    });
    await prisma.userMembership.create({
      data: { userId: assignee.id, companyId: realCompanyId, role: "ADMIN", isDefault: false },
    });
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const failingService = new LeadsService(
      {
        sendToUsers: vi.fn().mockRejectedValue(new Error("fcm down; token=abc123")),
      } as unknown as NotificationDispatchService,
      customersService,
    );

    try {
      const lead = await makeLead({ name: "Sensitive Customer Name" });
      const updated = await failingService.assignToUser(realCompanyId, lead.id, assignee.id);

      expect(updated.assignedToUserId).toBe(assignee.id);
      const persisted = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(persisted.assignedToUserId).toBe(assignee.id);

      expect(errorLog).toHaveBeenCalledTimes(1);
      const logged = String(errorLog.mock.calls[0][0]);
      expect(logged).toContain("LEAD_ASSIGNED");
      expect(logged).not.toContain("abc123");
      expect(logged).not.toContain("Sensitive Customer Name");
    } finally {
      errorLog.mockRestore();
      await prisma.userMembership.deleteMany({ where: { userId: assignee.id } });
      await prisma.lead.updateMany({ where: { assignedToUserId: assignee.id }, data: { assignedToUserId: null } });
      await prisma.user.delete({ where: { id: assignee.id } });
    }
  });

  it("clears assignment when assignedToUserId is null", async () => {
    const lead = await makeLead();
    const updated = await service.assignToUser(realCompanyId, lead.id, null);
    expect(updated.assignedToUserId).toBeNull();
  });

  it("rejects invalid assignees", async () => {
    const lead = await makeLead();
    await expect(
      service.assignToUser(realCompanyId, lead.id, "non-existent-user-id"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects cross-company lead assignment lookups", async () => {
    const otherCompanyId = `Z${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other4", status: "ACTIVE" } });
    const otherLead = await prisma.lead.create({
      data: { companyId: otherCompanyId, name: "Foreign4", email: "foreign4@example.com" },
    });

    await expect(
      service.assignToUser(realCompanyId, otherLead.id, null),
    ).rejects.toBeInstanceOf(NotFoundException);

    await prisma.lead.delete({ where: { id: otherLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });
});
