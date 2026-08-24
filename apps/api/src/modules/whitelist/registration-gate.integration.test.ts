import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@medcal/auth";
import { prisma } from "@medcal/db";
import { AppModule } from "../../app.module";
import { getRegistrationRejectionReasonForContext } from "./registration-gate";

// Real Postgres, same DATABASE_URL apps/api's dev script uses (loaded via
// vitest.setup.ts). No mocking — consistent with this project's existing
// verification approach across F1-F4.

const APPS_ORIGIN = "http://apps.localhost:3003";
const PORTAL_ORIGIN = "http://portal.localhost:3003";

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
// schema — same one-time exception bootstrap-superadmin.ts uses).
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

/**
 * GATING TEST — run this in isolation first (see Phase 2A/Phase 3 go-ahead):
 *   pnpm --filter @medcal/api test -- registration-gate -t "double-gate"
 *
 * Proves the 2A fix: registration-origin.hook.ts's @BeforeHook("/sign-up/email")
 * (context-aware, runs first per better-auth's dispatch.mjs — hooks.before
 * always resolves before the route handler) ALLOWs a CUSTOMER_PORTAL +
 * company-domain signup through, AND registration-gate.hook.ts's
 * @BeforeCreate("user") (now also context-aware, reading the same Origin via
 * the ALS-backed getCurrentAuthContext() Better Auth passes as its second
 * databaseHooks.create.before argument) does not silently re-reject it on the
 * way into the DB write. Asserts an actual User row exists — not just that no
 * error was thrown — because a silently-swallowed rejection and a genuine
 * success both look like "no error" from a shallower assertion.
 */
describe("2A double-gate fix — customer@<company-domain> via portal.* end-to-end", () => {
  let nestApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

  beforeAll(async () => {
    nestApp = await NestFactory.createApplicationContext(AppModule, { logger: false });
  });

  afterAll(async () => {
    await nestApp.close();
  });

  it("creates a real User row for a company-domain email registered via portal.*, with no whitelist entry", async () => {
    const email = `double-gate-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`;
    const result = await auth.api.signUpEmail({
      body: { email, password: "Password123!", name: "Double Gate Customer" },
      headers: new Headers({ origin: PORTAL_ORIGIN }),
    });

    expect(result.user.email).toBe(email);

    const persisted = await prisma.user.findUnique({ where: { email } });
    expect(persisted).not.toBeNull();
    expect(persisted?.id).toBe(result.user.id);

    const memberships = await prisma.userMembership.findMany({ where: { userId: result.user.id } });
    expect(memberships).toHaveLength(0);

    await prisma.session.deleteMany({ where: { userId: result.user.id } });
    await prisma.account.deleteMany({ where: { userId: result.user.id } });
    await prisma.user.delete({ where: { id: result.user.id } });
  });
});

describe("getRegistrationRejectionReasonForContext (origin-aware gate)", () => {
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

  it("INTERNAL_STAFF + company domain + ACTIVE whitelist → ALLOW", async () => {
    const email = `ctx-staff-ok-${randomUUID()}@kalibrasimedika.co.id`;
    await seedWhitelist(email, "ACTIVE");
    await expect(getRegistrationRejectionReasonForContext(email, "INTERNAL_STAFF")).resolves.toBeNull();
  });

  it("INTERNAL_STAFF + gmail → REJECT INVALID_DOMAIN", async () => {
    const email = `ctx-staff-gmail-${randomUUID()}@gmail.com`;
    await expect(getRegistrationRejectionReasonForContext(email, "INTERNAL_STAFF")).resolves.toBe(
      "INVALID_DOMAIN",
    );
  });

  it("INTERNAL_STAFF + company domain, no whitelist → REJECT NOT_WHITELISTED", async () => {
    const email = `ctx-staff-nw-${randomUUID()}@kalibrasimedika.co.id`;
    await expect(getRegistrationRejectionReasonForContext(email, "INTERNAL_STAFF")).resolves.toBe(
      "NOT_WHITELISTED",
    );
  });

  it("INTERNAL_STAFF + company domain, REVOKED whitelist → REJECT NOT_WHITELISTED (no status disclosure)", async () => {
    const email = `ctx-staff-revoked-${randomUUID()}@kalibrasimedika.co.id`;
    await seedWhitelistNoFk(email, "REVOKED");
    await expect(getRegistrationRejectionReasonForContext(email, "INTERNAL_STAFF")).resolves.toBe(
      "NOT_WHITELISTED",
    );
  });

  it("INTERNAL_STAFF normalizes mixed-case/whitespace before the whitelist lookup", async () => {
    const local = `ctx-staff-mixedcase-${randomUUID()}`;
    const canonical = `${local}@kalibrasimedika.co.id`;
    await seedWhitelist(canonical, "ACTIVE");
    const decorated = `  ${local}@KALIBRASIMEDIKA.CO.ID  `;
    await expect(getRegistrationRejectionReasonForContext(decorated, "INTERNAL_STAFF")).resolves.toBeNull();
  });

  it("CUSTOMER_PORTAL + gmail → ALLOW", async () => {
    const email = `ctx-cust-gmail-${randomUUID()}@gmail.com`;
    await expect(getRegistrationRejectionReasonForContext(email, "CUSTOMER_PORTAL")).resolves.toBeNull();
  });

  it("CUSTOMER_PORTAL + company domain, no whitelist → ALLOW (the core bug fix)", async () => {
    const email = `ctx-cust-company-${randomUUID()}@kalibrasimedika.co.id`;
    await expect(getRegistrationRejectionReasonForContext(email, "CUSTOMER_PORTAL")).resolves.toBeNull();
  });

  it("unrecognized/missing Origin → REJECT ORIGIN_NOT_ALLOWED", async () => {
    const email = `ctx-none-${randomUUID()}@gmail.com`;
    await expect(getRegistrationRejectionReasonForContext(email, null)).resolves.toBe("ORIGIN_NOT_ALLOWED");
  });
});

describe("registration hooks — real sign-up via auth.api.signUpEmail (RegistrationOriginHook + RegistrationGateHook)", () => {
  let nestApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

  beforeAll(async () => {
    nestApp = await NestFactory.createApplicationContext(AppModule, { logger: false });
  });

  afterAll(async () => {
    await nestApp.close();
    await prisma.emailWhitelist.deleteMany({ where: { email: { in: cleanupEmails } } });
  });

  it("allows an external Gmail sign-up via portal.* without whitelist and creates a User with zero UserMembership rows (G4)", async () => {
    const email = `sg-out-${randomUUID().slice(0, 8)}@gmail.com`;
    const result = await auth.api.signUpEmail({
      body: { email, password: "Password123!", name: "External Customer" },
      headers: new Headers({ origin: PORTAL_ORIGIN }),
    });
    expect(result.user.email).toBe(email);
    const memberships = await prisma.userMembership.findMany({ where: { userId: result.user.id } });
    expect(memberships).toHaveLength(0);
    await prisma.session.deleteMany({ where: { userId: result.user.id } });
    await prisma.account.deleteMany({ where: { userId: result.user.id } });
    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it("rejects a not-whitelisted company-domain sign-up via apps.* with REGISTRATION_NOT_WHITELISTED and creates zero User rows", async () => {
    const email = `sg-nw-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`;
    await expect(
      auth.api.signUpEmail({
        body: { email, password: "Password123!", name: "Reject Whitelist" },
        headers: new Headers({ origin: APPS_ORIGIN }),
      }),
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { code: "REGISTRATION_NOT_WHITELISTED" },
    });
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
  });

  it("allows a whitelisted company-domain sign-up via apps.* through unchanged", async () => {
    const email = `sg-ok-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`;
    await seedWhitelistNoFk(email, "ACTIVE");
    const result = await auth.api.signUpEmail({
      body: { email, password: "Password123!", name: "Allowed" },
      headers: new Headers({ origin: APPS_ORIGIN }),
    });
    expect(result.user.email).toBe(email);
    await prisma.session.deleteMany({ where: { userId: result.user.id } });
    await prisma.account.deleteMany({ where: { userId: result.user.id } });
    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it("allows a company-domain sign-up via portal.* without whitelist (the core bug fix, same case as the gating test above)", async () => {
    const email = `origin-cust-company-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`;
    const result = await auth.api.signUpEmail({
      body: { email, password: "Password123!", name: "Portal Company Email" },
      headers: new Headers({ origin: PORTAL_ORIGIN }),
    });
    expect(result.user.email).toBe(email);
    await prisma.session.deleteMany({ where: { userId: result.user.id } });
    await prisma.account.deleteMany({ where: { userId: result.user.id } });
    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it("rejects a gmail sign-up via apps.* with REGISTRATION_INVALID_DOMAIN", async () => {
    const email = `origin-staff-gmail-${randomUUID().slice(0, 8)}@gmail.com`;
    await expect(
      auth.api.signUpEmail({
        body: { email, password: "Password123!", name: "Fake Staff" },
        headers: new Headers({ origin: APPS_ORIGIN }),
      }),
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { code: "REGISTRATION_INVALID_DOMAIN" },
    });
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
  });

  // No end-to-end case for "Origin trusted by Better Auth but unresolved by
  // resolveRegistrationContext" here: every entry in this environment's
  // TRUSTED_ORIGINS (.env) resolves to apps./portal./the DEV_DEFAULT_HOST_GROUP
  // localhost fallback, so no trusted-but-unresolved Origin exists to exercise
  // against a real signUpEmail call. An Origin outside TRUSTED_ORIGINS entirely
  // is rejected earlier, by Better Auth's own origin-check middleware, before
  // this hook ever runs. The null-context branch itself is covered directly by
  // "unrecognized/missing Origin → REJECT ORIGIN_NOT_ALLOWED" above.

  it("ignores a spoofed registrationContext body field and still rejects a gmail sign-up via apps.*", async () => {
    const email = `origin-spoof-${randomUUID().slice(0, 8)}@gmail.com`;
    await expect(
      auth.api.signUpEmail({
        body: {
          email,
          password: "Password123!",
          name: "Spoofed Context",
          // @ts-expect-error — deliberately sending an unsupported body field to prove it's ignored.
          registrationContext: "CUSTOMER_PORTAL",
        },
        headers: new Headers({ origin: APPS_ORIGIN }),
      }),
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { code: "REGISTRATION_INVALID_DOMAIN" },
    });
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
  });
});
