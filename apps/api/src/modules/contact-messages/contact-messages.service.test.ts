import { randomUUID } from "node:crypto";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";

// Real Postgres, same DATABASE_URL apps/api's dev script uses (loaded via
// vitest.setup.ts). No mocking — consistent with registration-gate/whitelist tests.

const service = new ContactMessagesService();
const realCompanyId = "PKM"; // matches this dev environment's COMPANY_ID
const createdMessageIds: string[] = [];
let activeTopicId: number;
let inactiveTopicId: number;

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    getFrom: "CONTACTFORM",
    name: "Test User",
    email: `test-${randomUUID().slice(0, 8)}@example.com`,
    message: "Butuh kalibrasi alat.",
    ...overrides,
  };
}

beforeAll(async () => {
  const topic = await prisma.contactTopic.findFirst({ where: { isActive: true } });
  if (!topic) throw new Error("Expected at least one active ContactTopic to be seeded already");
  activeTopicId = topic.id;

  const inactive = await prisma.contactTopic.create({
    data: { name: `inactive-${randomUUID().slice(0, 8)}`, isActive: false },
  });
  inactiveTopicId = inactive.id;
});

afterAll(async () => {
  await prisma.contactMessage.deleteMany({ where: { id: { in: createdMessageIds } } });
  await prisma.contactTopic.delete({ where: { id: inactiveTopicId } });
});

describe("ContactMessagesService.create — validation", () => {
  it("rejects a payload missing name", async () => {
    const { name: _drop, ...payload } = basePayload();
    await expect(service.create(realCompanyId, payload)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_CONTACT_MESSAGE" },
    });
  });

  it("rejects an invalid email", async () => {
    await expect(
      service.create(realCompanyId, basePayload({ email: "not-an-email" })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a message that is empty", async () => {
    await expect(
      service.create(realCompanyId, basePayload({ message: "" })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a name exceeding the schema's max length", async () => {
    await expect(
      service.create(realCompanyId, basePayload({ name: "x".repeat(200) })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unknown topicId", async () => {
    await expect(
      service.create(realCompanyId, basePayload({ topicId: 999999 })),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_CONTACT_TOPIC" },
    });
  });

  it("rejects an inactive topicId", async () => {
    await expect(
      service.create(realCompanyId, basePayload({ topicId: inactiveTopicId })),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_CONTACT_TOPIC" },
    });
  });
});

describe("ContactMessagesService.create — companyId trust boundary", () => {
  it("ignores any companyId-shaped value inside the body — only the guard-derived companyId argument is used", async () => {
    const payload = basePayload({ companyId: "NOT-A-REAL-COMPANY", topicId: activeTopicId });
    const result = await service.create(realCompanyId, payload);
    createdMessageIds.push(result.id);
    const stored = await prisma.contactMessage.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored.companyId).toBe(realCompanyId);
  });

  it("throws a real 500 (not a disguised 200) when companyId does not resolve to a known Company", async () => {
    await expect(service.create("ZZZ-UNKNOWN", basePayload())).rejects.toMatchObject({
      status: 500,
    });
    await expect(service.create("ZZZ-UNKNOWN", basePayload())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

describe("ContactMessagesService.create — happy path", () => {
  it("creates a message with a valid active topic and returns id + matchStatus", async () => {
    const result = await service.create(realCompanyId, basePayload({ topicId: activeTopicId }));
    createdMessageIds.push(result.id);
    expect(result.id).toBeTruthy();
    expect(result.matchStatus).toBe("NONE");

    const stored = await prisma.contactMessage.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored.getFrom).toBe("CONTACTFORM");
    expect(stored.status).toBe("PENDING");
    expect(stored.topicId).toBe(activeTopicId);
  });
});

describe("ContactMessagesService.findActiveTopics", () => {
  it("returns only active topics", async () => {
    const topics = await service.findActiveTopics();
    expect(topics.some((t) => t.id === inactiveTopicId)).toBe(false);
    expect(topics.length).toBeGreaterThan(0);
  });
});
