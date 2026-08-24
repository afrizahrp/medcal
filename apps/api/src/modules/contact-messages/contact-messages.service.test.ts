import { randomUUID } from "node:crypto";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";
import { onContactMessageCreated } from "./contact-message-events";

// Real Postgres, same DATABASE_URL apps/api's dev script uses (loaded via
// vitest.setup.ts). No mocking — consistent with registration-gate/whitelist tests.

const service = new ContactMessagesService();
const realCompanyId = "PKM"; // matches this dev environment's COMPANY_ID
const createdMessageIds: string[] = [];
// ContactMessagesService.create() now also creates a Lead as a side effect
// (Lead Inbox identity matching) — must be tracked and cleaned up here too,
// or every run of this file leaks "Test User" Leads into the real dev DB.
const createdLeadIds: string[] = [];
let activeTopicId: number;
let inactiveTopicId: number;

async function create(payload: Record<string, unknown>) {
  const result = await service.create(realCompanyId, payload);
  createdMessageIds.push(result.id);
  if (result.leadId) createdLeadIds.push(result.leadId);
  return result;
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    getFrom: "CONTACTFORM",
    name: "Test User",
    email: `test-${randomUUID().slice(0, 8)}@example.com`,
    message: "Butuh kalibrasi alat.",
    ...overrides,
  };
}

// countUnread's before/after assertions read a company-wide COUNT, which
// realCompanyId ("PKM") cannot safely support — vitest runs test FILES in
// parallel, and every other file in this suite also writes ContactMessage
// rows for "PKM" concurrently, so a global count taken there is inherently
// racy. A dedicated throwaway company (untouched by every other test file)
// makes those counts deterministic. Company.id is `@db.Char(3)`, same
// constraint as "PKM".
const countCompanyId = "CNT";

async function createForCompany(companyId: string, payload: Record<string, unknown>) {
  const result = await service.create(companyId, payload);
  createdMessageIds.push(result.id);
  if (result.leadId) createdLeadIds.push(result.leadId);
  return result;
}

beforeAll(async () => {
  const topic = await prisma.contactTopic.findFirst({ where: { isActive: true } });
  if (!topic) throw new Error("Expected at least one active ContactTopic to be seeded already");
  activeTopicId = topic.id;

  const inactive = await prisma.contactTopic.create({
    data: { name: `inactive-${randomUUID().slice(0, 8)}`, isActive: false },
  });
  inactiveTopicId = inactive.id;

  await prisma.company.upsert({
    where: { id: countCompanyId },
    create: { id: countCompanyId, name: "Unread Count Test Co", status: "ACTIVE" },
    update: {},
  });
});

afterAll(async () => {
  await prisma.contactMessage.deleteMany({ where: { id: { in: createdMessageIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
  await prisma.contactTopic.delete({ where: { id: inactiveTopicId } });
  // Cascade-deletes any leftover ContactMessage/Lead rows under this
  // company too (Company -> ContactMessage/Lead is onDelete: Cascade).
  await prisma.company.delete({ where: { id: countCompanyId } }).catch(() => {});
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
    const result = await create(payload);
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
    const result = await create(basePayload({ topicId: activeTopicId }));
    expect(result.id).toBeTruthy();
    expect(result.matchStatus).toBe("NONE");

    const stored = await prisma.contactMessage.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored.getFrom).toBe("CONTACTFORM");
    expect(stored.status).toBe("PENDING");
    expect(stored.topicId).toBe(activeTopicId);
  });
});

describe("ContactMessagesService.create — new-ContactMessage realtime sync (E2E leads statistics sync audit, follow-up 2026-08-25)", () => {
  it("publishes exactly one contact-message-created event, after commit, for a Contact Form message", async () => {
    const payloads: { companyId: string }[] = [];
    const unsubscribe = onContactMessageCreated((payload) => payloads.push(payload));

    await create(basePayload({ getFrom: "CONTACTFORM", topicId: activeTopicId }));

    unsubscribe();
    expect(payloads).toEqual([{ companyId: realCompanyId }]);
  });

  // WhatsApp-lead shares this exact create() path — confirmed by the E2E
  // audit to always create a brand-new ContactMessage (no "update existing"
  // branch exists anywhere), so publishing here unconditionally covers it
  // too, not just Contact Form.
  it("publishes exactly one contact-message-created event for a WhatsApp-lead message", async () => {
    const payloads: { companyId: string }[] = [];
    const unsubscribe = onContactMessageCreated((payload) => payloads.push(payload));

    await create(basePayload({ getFrom: "WHATSAPP" }));

    unsubscribe();
    expect(payloads).toEqual([{ companyId: realCompanyId }]);
  });

  it("does not publish when creation fails validation", async () => {
    const payloads: { companyId: string }[] = [];
    const unsubscribe = onContactMessageCreated((payload) => payloads.push(payload));

    const { name: _drop, ...invalidPayload } = basePayload();
    await expect(service.create(realCompanyId, invalidPayload)).rejects.toBeInstanceOf(BadRequestException);

    unsubscribe();
    expect(payloads).toEqual([]);
  });

  it("does not publish when companyId does not resolve to a known Company", async () => {
    const payloads: { companyId: string }[] = [];
    const unsubscribe = onContactMessageCreated((payload) => payloads.push(payload));

    await expect(service.create("ZZZ-UNKNOWN", basePayload())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    unsubscribe();
    expect(payloads).toEqual([]);
  });

  it("does not publish for a transaction-scoped create (Web Chat's own path publishes separately, post-commit)", async () => {
    const payloads: { companyId: string }[] = [];
    const unsubscribe = onContactMessageCreated((payload) => payloads.push(payload));

    await prisma.$transaction(async (tx) => {
      const result = await service.create(realCompanyId, basePayload({ topicId: activeTopicId }), tx);
      createdMessageIds.push(result.id);
      if (result.leadId) createdLeadIds.push(result.leadId);
    });

    unsubscribe();
    expect(payloads).toEqual([]);
  });
});

describe("ContactMessagesService.findActiveTopics", () => {
  it("returns only active topics", async () => {
    const topics = await service.findActiveTopics();
    expect(topics.some((t) => t.id === inactiveTopicId)).toBe(false);
    expect(topics.length).toBeGreaterThan(0);
  });
});

describe("ContactMessagesService.updateStatus — unread tracking (Lead Inbox, locked 2026-08-16 Decision 4)", () => {
  it("transitions PENDING → READ", async () => {
    const created = await create(basePayload({ topicId: activeTopicId }));

    const stored = await prisma.contactMessage.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("PENDING");

    const updated = await service.updateStatus(realCompanyId, created.id, "READ");
    expect(updated.status).toBe("READ");
  });

  it("throws NotFoundException for a message belonging to a different company", async () => {
    const created = await create(basePayload({ topicId: activeTopicId }));

    await expect(service.updateStatus("ZZZ-UNKNOWN", created.id, "READ")).rejects.toMatchObject({
      status: 404,
      response: { code: "CONTACT_MESSAGE_NOT_FOUND" },
    });
  });

  it("keeps READ as READ when already READ (idempotent)", async () => {
    const created = await create(basePayload({ topicId: activeTopicId }));
    await service.updateStatus(realCompanyId, created.id, "READ");

    const updated = await service.updateStatus(realCompanyId, created.id, "READ");
    expect(updated.status).toBe("READ");
  });

  it("does not regress REPLIED back to READ", async () => {
    const created = await create(basePayload({ topicId: activeTopicId }));
    await service.updateStatus(realCompanyId, created.id, "REPLIED");

    const updated = await service.updateStatus(realCompanyId, created.id, "READ");
    expect(updated.status).toBe("REPLIED");
  });

  it("does not regress CLOSED back to READ", async () => {
    const created = await create(basePayload({ topicId: activeTopicId }));
    await service.updateStatus(realCompanyId, created.id, "CLOSED");

    const updated = await service.updateStatus(realCompanyId, created.id, "READ");
    expect(updated.status).toBe("CLOSED");
  });
});

describe("ContactMessagesService.countUnread — Management header badge (2026-08-17 audit)", () => {
  it("counts a PENDING message as unread", async () => {
    const before = await service.countUnread(countCompanyId);
    await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before + 1);
  });

  it("does not count a READ message as unread", async () => {
    const created = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const before = await service.countUnread(countCompanyId);

    await service.updateStatus(countCompanyId, created.id, "READ");

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before - 1);
  });

  it("does not count a REPLIED message as unread", async () => {
    const created = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const before = await service.countUnread(countCompanyId);

    await service.updateStatus(countCompanyId, created.id, "REPLIED");

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before - 1);
  });

  it("does not count a CLOSED message as unread", async () => {
    const created = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const before = await service.countUnread(countCompanyId);

    await service.updateStatus(countCompanyId, created.id, "CLOSED");

    const after = await service.countUnread(countCompanyId);
    expect(after).toBe(before - 1);
  });

  it("scopes the count to the given companyId only", async () => {
    const before = await service.countUnread("ZZZ-UNKNOWN");
    await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const after = await service.countUnread("ZZZ-UNKNOWN");
    expect(after).toBe(before);
  });
});

describe("ContactMessagesService.findAll — status filter/pagination (Contact Messages status/filter/count correction, 2026-08-18)", () => {
  it("filters by ContactStatus, not LeadStatus, and reconciles with getStatistics", async () => {
    const pending = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const read = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    await service.updateStatus(countCompanyId, read.id, "READ");
    const replied = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    await service.updateStatus(countCompanyId, replied.id, "REPLIED");
    const closed = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    await service.updateStatus(countCompanyId, closed.id, "CLOSED");

    const stats = await service.getStatistics(countCompanyId);

    const [pendingResult, readResult, repliedResult, closedResult] = await Promise.all([
      service.findAll(countCompanyId, { status: "PENDING", pageSize: 1 }),
      service.findAll(countCompanyId, { status: "READ", pageSize: 1 }),
      service.findAll(countCompanyId, { status: "REPLIED", pageSize: 1 }),
      service.findAll(countCompanyId, { status: "CLOSED", pageSize: 1 }),
    ]);

    // Filtered `total` reconciles with the global card count for that status
    // — even though pageSize:1 means `data` itself only has 1 row.
    expect(pendingResult.total).toBe(stats.pending);
    expect(readResult.total).toBe(stats.read);
    expect(repliedResult.total).toBe(stats.replied);
    expect(closedResult.total).toBe(stats.closed);

    expect(pendingResult.data.every((m) => m.status === "PENDING")).toBe(true);
    expect(readResult.data.every((m) => m.status === "READ")).toBe(true);
    expect(repliedResult.data.every((m) => m.status === "REPLIED")).toBe(true);
    expect(closedResult.data.every((m) => m.status === "CLOSED")).toBe(true);
    expect(pendingResult.data.some((m) => m.id === pending.id) || pendingResult.total > 1).toBe(true);
  });

  it("total (no status filter) equals getStatistics().total", async () => {
    await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));

    const stats = await service.getStatistics(countCompanyId);
    const all = await service.findAll(countCompanyId, { pageSize: 1 });

    expect(all.total).toBe(stats.total);
  });

  it("pagination does not change the total, and moving pages does not affect status counts", async () => {
    for (let i = 0; i < 3; i += 1) {
      await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    }

    const page1 = await service.findAll(countCompanyId, { page: 1, pageSize: 2 });
    const page2 = await service.findAll(countCompanyId, { page: 2, pageSize: 2 });

    expect(page1.total).toBe(page2.total);
    expect(page1.data.length).toBeLessThanOrEqual(2);
  });

  it("scopes results to the given companyId only", async () => {
    await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const other = await service.findAll("ZZZ-UNKNOWN", {});
    expect(other.total).toBe(0);
    expect(other.data).toEqual([]);
  });

  it("search matches ContactMessage fields directly, not Lead fields", async () => {
    const uniqueName = `Search-${randomUUID().slice(0, 8)}`;
    await createForCompany(countCompanyId, basePayload({ name: uniqueName, topicId: activeTopicId }));

    const result = await service.findAll(countCompanyId, { search: uniqueName });
    expect(result.data.some((m) => m.name === uniqueName)).toBe(true);
  });

  it("computes totalPages from total and pageSize", async () => {
    for (let i = 0; i < 3; i += 1) {
      await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    }

    const result = await service.findAll(countCompanyId, { pageSize: 2 });
    expect(result.totalPages).toBe(Math.max(1, Math.ceil(result.total / 2)));
  });
});

describe("ContactMessagesService.findAll — sortBy/sortDir (Management List canonical pattern, 2026-08-18)", () => {
  it("sorts by name ascending when requested", async () => {
    const aName = `AAA-${randomUUID().slice(0, 6)}`;
    const zName = `ZZZ-${randomUUID().slice(0, 6)}`;
    await createForCompany(countCompanyId, basePayload({ name: zName, topicId: activeTopicId }));
    await createForCompany(countCompanyId, basePayload({ name: aName, topicId: activeTopicId }));

    const result = await service.findAll(countCompanyId, {
      search: undefined,
      sortBy: "name",
      sortDir: "asc",
      pageSize: 100,
    });
    const names = result.data.map((m) => m.name).filter((n) => n === aName || n === zName);
    expect(names).toEqual([aName, zName]);
  });

  it("falls back to createdAt desc for an unwhitelisted sortBy", async () => {
    const created = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));

    const result = await service.findAll(countCompanyId, { sortBy: "companyId", pageSize: 1 });
    expect(result.data[0]?.id).toBe(created.id);
  });
});

describe("ContactMessagesService.getStatistics — global tenant summary", () => {
  it("returns global status counts scoped to companyId", async () => {
    const before = await service.getStatistics(countCompanyId);

    const pending = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const read = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    await service.updateStatus(countCompanyId, read.id, "READ");
    const replied = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    await service.updateStatus(countCompanyId, replied.id, "REPLIED");
    const closed = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    await service.updateStatus(countCompanyId, closed.id, "CLOSED");

    const after = await service.getStatistics(countCompanyId);

    expect(after.total).toBe(before.total + 4);
    expect(after.pending).toBe(before.pending + 1);
    expect(after.read).toBe(before.read + 1);
    expect(after.replied).toBe(before.replied + 1);
    expect(after.closed).toBe(before.closed + 1);
    expect(after.pending + after.read + after.replied + after.closed).toBe(after.total);
  });

  it("moving PENDING -> READ -> CLOSED shifts pending/read/closed counts without changing total (Leads/[id] sync, 2026-08-25)", async () => {
    const before = await service.getStatistics(countCompanyId);
    const message = await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));

    await service.updateStatus(countCompanyId, message.id, "READ");
    const afterRead = await service.getStatistics(countCompanyId);
    expect(afterRead.total).toBe(before.total + 1);
    expect(afterRead.pending).toBe(before.pending);
    expect(afterRead.read).toBe(before.read + 1);

    await service.updateStatus(countCompanyId, message.id, "CLOSED");
    const afterClosed = await service.getStatistics(countCompanyId);
    expect(afterClosed.total).toBe(before.total + 1);
    expect(afterClosed.read).toBe(before.read);
    expect(afterClosed.closed).toBe(before.closed + 1);
  });

  it("does not include another company's messages", async () => {
    const before = await service.getStatistics("ZZZ-UNKNOWN");
    await createForCompany(countCompanyId, basePayload({ topicId: activeTopicId }));
    const after = await service.getStatistics("ZZZ-UNKNOWN");
    expect(after).toEqual(before);
  });
});
