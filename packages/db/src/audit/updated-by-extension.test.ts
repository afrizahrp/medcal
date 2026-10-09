import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "../index";
import { FIXTURE_COMPANY_ID, seedTestFixtures } from "../testing/fixtures";
import { getActorUserId, runWithActor as runWithActorRaw } from "./actor-context";
import { isUpdateAudited } from "./updated-by-extension";

/**
 * Models that intentionally have NO updatedByUserId. Every Prisma model must be
 * either audited (declares updatedByUserId) or listed here with its reason, so a
 * newly added model cannot silently skip the audit decision.
 */
const EXCLUDED: Record<string, string> = {
  Session: "auth infrastructure",
  Account: "auth infrastructure",
  Verification: "auth infrastructure",
  FCMToken: "device push token, self-managed",
  DocumentNumberSequence: "system counter",
  MasterCodeSequence: "system counter",
  EmailWhitelist: "carries its own createdBy/revokedBy lifecycle fields",
  CustomerUserLink: "junction row (upsert only)",
  ChatSession: "public chat, no authenticated actor",
  ChatMessage: "append-only chat log",
  CalibrationRequestHistory: "immutable history",
  CalibrationRequestItemHistory: "immutable history",
  QuotationHistory: "immutable history",
  QuotationItemHistory: "immutable history",
  QuotationAdditionalItemHistory: "immutable history",
  PurchaseOrderHistory: "immutable history",
  PurchaseOrderItemHistory: "immutable history",
  PurchaseOrderAdditionalItemHistory: "immutable history",
  WorkOrderHistory: "immutable history",
  WorkOrderItemHistory: "immutable history",
  WorkOrderAssignment: "create/delete only",
  WorkOrderItemAccessory: "create/delete only",
  WorkOrderItem: "immutable allocation snapshot",
  SpkParent: "create-only grouping row",
  EquipmentDeliveryNoteItem: "create/delete only",
  JobEvidence: "append-only evidence",
  CustomerSignature: "append-only signature",
  InvoiceCertificate: "junction row",
  InvoiceItem: "create/delete only",
  ReminderEvent: "system-generated",
  FileObject: "immutable blob metadata",
  AuditLog: "append-only log",
  CustomerFeedback: "append-only submission",
  LkDownloadAuthorization: "single-use token state",
};

// Prisma promises are lazy (they execute on first .then), so the query must be
// awaited INSIDE the actor scope, exactly as service code does.
function runWithActor<T>(userId: string | null, fn: () => PromiseLike<T>): Promise<T> {
  return runWithActorRaw(userId, async () => await fn());
}

const suffix = randomUUID().slice(0, 8);

beforeAll(async () => {
  await seedTestFixtures();
});

async function makeUser(tag: string) {
  return prisma.user.create({ data: { email: `aud-${tag}-${suffix}@test.local`, name: tag } });
}

async function makeUom(tag: string) {
  return prisma.uom.create({
    data: { code: `AUD-${tag}-${suffix}`, name: tag, symbol: "x", category: "PRESSURE" },
  });
}

describe("updatedByUserId model coverage", () => {
  it("every model is either audited or explicitly excluded", () => {
    const names = Prisma.dmmf.datamodel.models.map((m) => m.name);
    const unclassified = names.filter((n) => !isUpdateAudited(n) && !(n in EXCLUDED));
    expect(unclassified).toEqual([]);
    const audited = names.filter((n) => isUpdateAudited(n));
    expect(audited.length + Object.keys(EXCLUDED).length).toBe(names.length);
  });

  it("excluded models exist and stay excluded", () => {
    for (const name of Object.keys(EXCLUDED)) {
      expect(
        Prisma.dmmf.datamodel.models.some((m) => m.name === name),
        name,
      ).toBe(true);
      expect(isUpdateAudited(name), name).toBe(false);
    }
  });

  it("every audited model also has updatedAt and an updatedBy User relation", () => {
    for (const model of Prisma.dmmf.datamodel.models.filter((m) => isUpdateAudited(m.name))) {
      expect(model.fields.some((f) => f.name === "updatedAt"), model.name).toBe(true);
      expect(
        model.fields.some((f) => f.name === "updatedBy" && f.type === "User"),
        model.name,
      ).toBe(true);
    }
  });
});

describe("updated-by Prisma extension", () => {
  it("stamps the authenticated actor and bumps updatedAt on update", async () => {
    const actor = await makeUser("a");
    const uom = await makeUom("u1");
    expect(uom.updatedByUserId).toBeNull();

    const updated = await runWithActor(actor.id, () =>
      prisma.uom.update({ where: { id: uom.id }, data: { name: "renamed" } }),
    );
    expect(updated.updatedByUserId).toBe(actor.id);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(uom.updatedAt.getTime());
  });

  it("different actors produce different updatedByUserId", async () => {
    const a = await makeUser("x");
    const b = await makeUser("y");
    const uom = await makeUom("u2");
    const byA = await runWithActor(a.id, () => prisma.uom.update({ where: { id: uom.id }, data: { name: "1" } }));
    const byB = await runWithActor(b.id, () => prisma.uom.update({ where: { id: uom.id }, data: { name: "2" } }));
    expect(byA.updatedByUserId).toBe(a.id);
    expect(byB.updatedByUserId).toBe(b.id);
  });

  it("does not stamp without an actor (system convention) but still bumps updatedAt", async () => {
    const actor = await makeUser("s");
    const uom = await makeUom("u3");
    const first = await runWithActor(actor.id, () =>
      prisma.uom.update({ where: { id: uom.id }, data: { name: "1" } }),
    );
    const system = await prisma.uom.update({ where: { id: uom.id }, data: { name: "2" } });
    expect(system.updatedByUserId).toBe(actor.id); // left untouched, not cleared or invented
    expect(system.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    const nullActor = await runWithActor(null, () =>
      prisma.uom.update({ where: { id: uom.id }, data: { name: "3" } }),
    );
    expect(nullActor.updatedByUserId).toBe(actor.id);
  });

  it("an explicit updatedByUserId wins over the context actor", async () => {
    const ctx = await makeUser("c");
    const explicit = await makeUser("e");
    const uom = await makeUom("u4");
    const row = await runWithActor(ctx.id, () =>
      prisma.uom.update({ where: { id: uom.id }, data: { name: "1", updatedByUserId: explicit.id } }),
    );
    expect(row.updatedByUserId).toBe(explicit.id);
  });

  it("stamps updateMany", async () => {
    const actor = await makeUser("m");
    const u1 = await makeUom("m1");
    const u2 = await makeUom("m2");
    await runWithActor(actor.id, () =>
      prisma.uom.updateMany({ where: { id: { in: [u1.id, u2.id] } }, data: { isActive: false } }),
    );
    const rows = await prisma.uom.findMany({ where: { id: { in: [u1.id, u2.id] } } });
    expect(rows.map((r) => r.updatedByUserId)).toEqual([actor.id, actor.id]);
    expect(rows.every((r) => r.updatedAt.getTime() > u1.updatedAt.getTime())).toBe(true);
  });

  it("stamps only the update branch of upsert", async () => {
    const actor = await makeUser("up");
    const code = `AUD-UP-${suffix}`;
    const args = {
      where: { code },
      create: { code, name: "n", symbol: "x", category: "PRESSURE" as const },
      update: { name: "changed" },
    };
    const created = await runWithActor(actor.id, () => prisma.uom.upsert(args));
    expect(created.updatedByUserId).toBeNull();
    const updated = await runWithActor(actor.id, () => prisma.uom.upsert(args));
    expect(updated.updatedByUserId).toBe(actor.id);
  });

  it("does not stamp creates or reads", async () => {
    const actor = await makeUser("cr");
    const created = await runWithActor(actor.id, () =>
      prisma.uom.create({ data: { code: `AUD-CR-${suffix}`, name: "n", symbol: "x", category: "PRESSURE" } }),
    );
    expect(created.updatedByUserId).toBeNull();
    const read = await runWithActor(actor.id, () => prisma.uom.findUniqueOrThrow({ where: { id: created.id } }));
    expect(read.updatedByUserId).toBeNull();
    expect(read.updatedAt.getTime()).toBe(created.updatedAt.getTime());
  });

  it("preserves the actor across interactive and batch transactions", async () => {
    const actor = await makeUser("tx");
    const u1 = await makeUom("t1");
    const u2 = await makeUom("t2");
    await runWithActor(actor.id, () =>
      prisma.$transaction(async (tx) => {
        await tx.uom.update({ where: { id: u1.id }, data: { name: "tx1" } });
        await Promise.resolve();
        await tx.uom.update({ where: { id: u2.id }, data: { name: "tx2" } });
      }),
    );
    const rows = await prisma.uom.findMany({ where: { id: { in: [u1.id, u2.id] } } });
    expect(rows.every((r) => r.updatedByUserId === actor.id)).toBe(true);

    const other = await makeUser("tx2");
    await runWithActor(other.id, () =>
      prisma.$transaction([prisma.uom.update({ where: { id: u1.id }, data: { name: "tx3" } })]),
    );
    expect((await prisma.uom.findUniqueOrThrow({ where: { id: u1.id } })).updatedByUserId).toBe(other.id);
  });

  it("isolates concurrent actors", async () => {
    const a = await makeUser("ca");
    const b = await makeUser("cb");
    const u1 = await makeUom("k1");
    const u2 = await makeUom("k2");
    await Promise.all([
      runWithActor(a.id, async () => {
        await new Promise((r) => setTimeout(r, 20));
        await prisma.uom.update({ where: { id: u1.id }, data: { name: "a" } });
        expect(getActorUserId()).toBe(a.id);
      }),
      runWithActor(b.id, async () => {
        await prisma.uom.update({ where: { id: u2.id }, data: { name: "b" } });
      }),
    ]);
    expect((await prisma.uom.findUniqueOrThrow({ where: { id: u1.id } })).updatedByUserId).toBe(a.id);
    expect((await prisma.uom.findUniqueOrThrow({ where: { id: u2.id } })).updatedByUserId).toBe(b.id);
  });

  it("stamps nested updates, using the relation form when the caller uses relation input", async () => {
    const actor = await makeUser("n");
    const customer = await prisma.customer.create({
      data: { companyId: FIXTURE_COMPANY_ID, number: `AUD-${suffix}`, name: "c" },
    });
    const contact = await prisma.customerContact.create({
      data: { companyId: FIXTURE_COMPANY_ID, customerId: customer.id, name: "k" },
    });
    await runWithActor(actor.id, () =>
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: "c2",
          company: { connect: { id: FIXTURE_COMPANY_ID } },
          contacts: { update: { where: { id: contact.id }, data: { name: "k2" } } },
        },
      }),
    );
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).updatedByUserId).toBe(actor.id);
    expect(
      (await prisma.customerContact.findUniqueOrThrow({ where: { id: contact.id } })).updatedByUserId,
    ).toBe(actor.id);
  });

  it("leaves excluded models untouched", async () => {
    const actor = await makeUser("ex");
    const token = await prisma.fCMToken.create({
      data: {
        companyId: FIXTURE_COMPANY_ID,
        userId: actor.id,
        token: `tok-${suffix}`,
        deviceType: "web",
        app: "PORTAL",
      },
    });
    const updated = await runWithActor(actor.id, () =>
      prisma.fCMToken.update({ where: { id: token.id }, data: { isActive: false } }),
    );
    expect(updated.isActive).toBe(false);
    expect("updatedByUserId" in updated).toBe(false);
  });
});
