import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { WhitelistService } from "./whitelist.service";

// Real Postgres, same DATABASE_URL apps/api's dev script uses (loaded via
// vitest.setup.ts). No mocking — consistent with registration-gate.integration.test.ts.

const shortId = randomUUID().slice(0, 8);
const creatorId = `wl-creator-${shortId}`;
const cleanupEmails: string[] = [];
const service = new WhitelistService();

function trackedEmail(prefix: string, domain: string): string {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@${domain}`;
  cleanupEmails.push(email.trim().toLowerCase());
  return email;
}

beforeAll(async () => {
  // Bootstrap user needed for EmailWhitelist.createdBy's FK, same pattern as
  // registration-gate.integration.test.ts.
  await prisma.user.upsert({
    where: { id: creatorId },
    create: { id: creatorId, email: `${creatorId}@kalibrasimedika.co.id`, status: "ACTIVE" },
    update: {},
  });
});

afterAll(async () => {
  await prisma.emailWhitelist.deleteMany({ where: { email: { in: cleanupEmails } } });
  await prisma.user.deleteMany({ where: { id: creatorId } });
});

describe("WhitelistService.create — company domain validation", () => {
  it("accepts a company-domain email and creates an ACTIVE entry", async () => {
    const email = trackedEmail("wl-ok", "kalibrasimedika.co.id");
    const entry = await service.create(email, creatorId);
    expect(entry.email).toBe(email.trim().toLowerCase());
    expect(entry.status).toBe("ACTIVE");
    expect(entry.createdBy).toBe(creatorId);
  });

  it("rejects a non-company domain with 400 INVALID_REGISTRATION_DOMAIN and creates no row", async () => {
    const email = trackedEmail("wl-gmail", "gmail.com");
    await expect(service.create(email, creatorId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_REGISTRATION_DOMAIN" },
    });
    await expect(
      prisma.emailWhitelist.findUnique({ where: { email: email.trim().toLowerCase() } }),
    ).resolves.toBeNull();
  });

  it("rejects the subdomain-suffix trick with 400 INVALID_REGISTRATION_DOMAIN and creates no row", async () => {
    const email = trackedEmail("wl-trick", "kalibrasimedika.co.id.evil.com");
    await expect(service.create(email, creatorId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      prisma.emailWhitelist.findUnique({ where: { email: email.trim().toLowerCase() } }),
    ).resolves.toBeNull();
  });

  it("rejects a lookalike domain typo with 400 INVALID_REGISTRATION_DOMAIN and creates no row", async () => {
    const email = trackedEmail("wl-typo", "kalibrasimedika.cob.id");
    await expect(service.create(email, creatorId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_REGISTRATION_DOMAIN" },
    });
    await expect(
      prisma.emailWhitelist.findUnique({ where: { email: email.trim().toLowerCase() } }),
    ).resolves.toBeNull();
  });

  it("still rejects a duplicate company-domain email with 409 (unchanged behavior)", async () => {
    const email = trackedEmail("wl-dup", "kalibrasimedika.co.id");
    await service.create(email, creatorId);
    await expect(service.create(email, creatorId)).rejects.toBeInstanceOf(ConflictException);
  });
});
