import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@medcal/auth";
import { prisma } from "@medcal/db";
import { AppModule } from "../../app.module";
import { getRegistrationRejectionReason, isRegistrationAllowed } from "./registration-gate";

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

// createdBy is nullable/optional-FK (see EmailWhitelist.createdBy in the
// schema — same one-time exception bootstrap-superadmin.ts uses). Describes
// below run after the "isRegistrationAllowed" describe's afterAll has
// already deleted bootstrapUserId, so they seed independently of it.
async function seedWhitelistNoFk(email: string, status: "ACTIVE" | "REVOKED" = "ACTIVE") {
  cleanupEmails.push(email);
  await prisma.emailWhitelist.create({
    data: {
      email,
      status,
      createdBy: null,
      ...(status === "REVOKED" ? { revokedAt: new Date() } : {}),
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

describe("getRegistrationRejectionReason", () => {
  afterAll(async () => {
    await prisma.emailWhitelist.deleteMany({ where: { email: { in: cleanupEmails } } });
  });

  it("reports INVALID_DOMAIN for a non-company domain, even with a matching ACTIVE whitelist entry", async () => {
    const email = `reason-outside-${randomUUID()}@gmail.com`;
    await seedWhitelistNoFk(email, "ACTIVE");
    await expect(getRegistrationRejectionReason(email)).resolves.toBe("INVALID_DOMAIN");
  });

  it("reports NOT_WHITELISTED for a company-domain email with no whitelist entry", async () => {
    const email = `reason-no-entry-${randomUUID()}@kalibrasimedika.co.id`;
    await expect(getRegistrationRejectionReason(email)).resolves.toBe("NOT_WHITELISTED");
  });

  it("reports NOT_WHITELISTED (not a distinct reason) for a REVOKED entry — no status disclosure", async () => {
    const email = `reason-revoked-${randomUUID()}@kalibrasimedika.co.id`;
    await seedWhitelistNoFk(email, "REVOKED");
    await expect(getRegistrationRejectionReason(email)).resolves.toBe("NOT_WHITELISTED");
  });

  it("reports null (allowed) for a company-domain email with an ACTIVE entry", async () => {
    const email = `reason-allowed-${randomUUID()}@kalibrasimedika.co.id`;
    await seedWhitelistNoFk(email, "ACTIVE");
    await expect(getRegistrationRejectionReason(email)).resolves.toBeNull();
  });
});

describe("registration gate — real sign-up rejection (RegistrationGateHook via auth.api.signUpEmail)", () => {
  // RegistrationGateHook is a @DatabaseHook() Nest provider — it's only wired
  // into Better Auth's databaseHooks when AppModule actually bootstraps (see
  // AuthModule's setupDatabaseHooks in @thallesp/nestjs-better-auth), same as
  // bootstrap-superadmin.ts. Without this, auth.api.signUpEmail() here would
  // bypass the gate entirely (no NestJS DI container, no hook registered).
  let nestApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

  beforeAll(async () => {
    nestApp = await NestFactory.createApplicationContext(AppModule, { logger: false });
  });

  afterAll(async () => {
    await nestApp.close();
    await prisma.emailWhitelist.deleteMany({ where: { email: { in: cleanupEmails } } });
  });

  it("rejects an invalid-domain sign-up with REGISTRATION_INVALID_DOMAIN and creates zero User rows", async () => {
    // User.email is @db.VarChar(50) — short id, matching the file's existing convention.
    const email = `sg-out-${randomUUID().slice(0, 8)}@gmail.com`;
    await expect(
      auth.api.signUpEmail({ body: { email, password: "Password123!", name: "Reject Domain" } }),
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { code: "REGISTRATION_INVALID_DOMAIN" },
    });
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
  });

  it("rejects a not-whitelisted company-domain sign-up with REGISTRATION_NOT_WHITELISTED and creates zero User rows", async () => {
    const email = `sg-nw-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`;
    await expect(
      auth.api.signUpEmail({ body: { email, password: "Password123!", name: "Reject Whitelist" } }),
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { code: "REGISTRATION_NOT_WHITELISTED" },
    });
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
  });

  it("allows a whitelisted company-domain sign-up through unchanged", async () => {
    const email = `sg-ok-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`;
    await seedWhitelistNoFk(email, "ACTIVE");
    const result = await auth.api.signUpEmail({
      body: { email, password: "Password123!", name: "Allowed" },
    });
    expect(result.user.email).toBe(email);
    await prisma.session.deleteMany({ where: { userId: result.user.id } });
    await prisma.account.deleteMany({ where: { userId: result.user.id } });
    await prisma.user.delete({ where: { id: result.user.id } });
  });
});
