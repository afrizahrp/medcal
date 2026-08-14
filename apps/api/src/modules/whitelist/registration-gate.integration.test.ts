import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { isRegistrationAllowed } from "./registration-gate";

// Real Postgres, same DATABASE_URL apps/api's dev script uses (loaded via
// vitest.setup.ts). No mocking — consistent with this project's existing
// verification approach across F1-F4.

// User.email is @db.VarChar(50) — keep this short.
const shortId = randomUUID().slice(0, 8);
const bootstrapUserId = `bootstrap-${shortId}`;
const cleanupEmails: string[] = [];

async function seedWhitelist(email: string, status: "ACTIVE" | "REVOKED" = "ACTIVE") {
  cleanupEmails.push(email);
  await prisma.emailWhitelist.create({
    data: {
      email,
      status,
      createdBy: bootstrapUserId,
      ...(status === "REVOKED" ? { revokedBy: bootstrapUserId, revokedAt: new Date() } : {}),
    },
  });
}

describe("isRegistrationAllowed", () => {
  afterAll(async () => {
    await prisma.emailWhitelist.deleteMany({ where: { email: { in: cleanupEmails } } });
    await prisma.user.deleteMany({ where: { id: bootstrapUserId } });
  });

  it("creates the FK bootstrap user needed for createdBy", async () => {
    await prisma.user.upsert({
      where: { id: bootstrapUserId },
      create: { id: bootstrapUserId, email: `${bootstrapUserId}@kalibrasimedika.co.id`, status: "ACTIVE" },
      update: {},
    });
  });

  it("allows a company-domain email with an ACTIVE whitelist entry", async () => {
    const email = `allowed-${randomUUID()}@kalibrasimedika.co.id`;
    await seedWhitelist(email, "ACTIVE");
    await expect(isRegistrationAllowed(email)).resolves.toBe(true);
  });

  it("rejects a company-domain email with no whitelist entry", async () => {
    const email = `no-entry-${randomUUID()}@kalibrasimedika.co.id`;
    await expect(isRegistrationAllowed(email)).resolves.toBe(false);
  });

  it("rejects a company-domain email with a REVOKED whitelist entry", async () => {
    const email = `revoked-${randomUUID()}@kalibrasimedika.co.id`;
    await seedWhitelist(email, "REVOKED");
    await expect(isRegistrationAllowed(email)).resolves.toBe(false);
  });

  it("rejects a non-company domain even with a matching ACTIVE whitelist entry", async () => {
    const email = `outside-${randomUUID()}@gmail.com`;
    await seedWhitelist(email, "ACTIVE");
    await expect(isRegistrationAllowed(email)).resolves.toBe(false);
  });

  it("rejects the subdomain-suffix trick even with a matching ACTIVE whitelist entry", async () => {
    const email = `trick-${randomUUID()}@kalibrasimedika.co.id.evil.com`;
    await seedWhitelist(email, "ACTIVE");
    await expect(isRegistrationAllowed(email)).resolves.toBe(false);
  });

  it("normalizes mixed-case/whitespace before the whitelist lookup", async () => {
    const local = `mixedcase-${randomUUID()}`;
    const canonical = `${local}@kalibrasimedika.co.id`;
    await seedWhitelist(canonical, "ACTIVE");
    const decorated = `  ${local}@KALIBRASIMEDIKA.CO.ID  `;
    await expect(isRegistrationAllowed(decorated)).resolves.toBe(true);
  });
});
