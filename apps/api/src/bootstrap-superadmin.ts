import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { auth } from "@medcal/auth";
import { prisma } from "@medcal/db";
import type { User } from "@medcal/db";
import { isAllowedRegistrationDomain, normalizeEmail } from "@medcal/shared";
import { AppModule } from "./app.module";

/**
 * One-time, explicitly-invoked bootstrap for the first production SUPERADMIN.
 *
 * Not started automatically (no hook into main.ts/app startup) — must be run
 * manually, once, by an operator:
 *
 *   pnpm --filter @medcal/api run bootstrap:superadmin -- \
 *     --email=admin@kalibrasimedika.co.id --password=... --name="..."
 *
 * Boots the real Nest application context (NestFactory.createApplicationContext,
 * no HTTP listener) so AuthModule wires the actual databaseHooks.user.create.before
 * hook (RegistrationGateHook) exactly as it does in production — the account is
 * created through auth.api.signUpEmail() and is validated by the SAME F4
 * registration gate (company-domain lock + ACTIVE EmailWhitelist) as every other
 * user, not a bypassed or re-implemented copy of it.
 *
 * Refuses to run if a SUPERADMIN UserMembership already exists for COMPANY_ID.
 * Resumable: if a prior run got partway through (e.g. the User was created but
 * the SUPERADMIN grant failed), re-running detects what already exists and only
 * performs the remaining step(s), rather than failing or duplicating anything.
 */

interface Args {
  email: string;
  password: string;
  name: string;
}

function parseArgs(argv: string[]): Args {
  const values: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) {
      values[match[1]!] = match[2]!;
    }
  }
  if (!values.email) {
    throw new Error("Missing required --email=<address>");
  }
  if (!values.password) {
    throw new Error("Missing required --password=<password>");
  }
  return {
    email: values.email,
    password: values.password,
    name: values.name ?? "Superadmin",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isAllowedRegistrationDomain(args.email)) {
    throw new Error(
      `Refusing to bootstrap: "${args.email}" is not on the locked registration domain (kalibrasimedika.co.id).`,
    );
  }

  const companyId = process.env.COMPANY_ID;
  if (!companyId) {
    throw new Error("COMPANY_ID is not set — cannot determine which company to grant SUPERADMIN on.");
  }

  const email = normalizeEmail(args.email);

  console.log("[bootstrap] Starting Nest application context (no HTTP listener)...");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const existingSuperadmin = await prisma.userMembership.findFirst({
      where: { companyId, role: "SUPERADMIN" },
    });
    if (existingSuperadmin) {
      console.error(
        `[bootstrap] Refusing to proceed: a SUPERADMIN UserMembership already exists for company "${companyId}". ` +
          "Bootstrap is one-time only; use the whitelist:manage / membership tooling for further admins.",
      );
      process.exitCode = 1;
      return;
    }

    // The one deliberate, offline exception to whitelist:manage's normal
    // SUPERADMIN-only authority: no SUPERADMIN exists yet to grant it via the
    // API, so this script performs it directly, once. createdBy stays NULL —
    // see the schema comment on EmailWhitelist.createdBy.
    await prisma.emailWhitelist.upsert({
      where: { email },
      create: { email, status: "ACTIVE", createdBy: null },
      update: { status: "ACTIVE" },
    });
    console.log(`[bootstrap] EmailWhitelist entry for "${email}" is ACTIVE.`);

    let user: User | null = await prisma.user.findUnique({ where: { email } });
    if (user) {
      console.log(`[bootstrap] User "${email}" already exists — skipping account creation, resuming from here.`);
    } else {
      // Goes through the real, unmodified F4 registration gate — this call
      // fails exactly like any other blocked sign-up would if the whitelist
      // entry above were somehow missing or the domain check failed.
      const result = await auth.api.signUpEmail({
        body: { email, password: args.password, name: args.name },
      });
      user = result.user as User;
      console.log(`[bootstrap] Account created for "${email}" (id: ${user.id}).`);
    }

    // G3 lock: User.status is now enforced in guards. Bootstrap SUPERADMIN must
    // be ACTIVE to access the application. Better Auth creates users as INVITED
    // by default, so we explicitly activate them here.
    if (user.status !== "ACTIVE") {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "ACTIVE" },
      });
      console.log(`[bootstrap] User status set to ACTIVE.`);
    }

    const existingMembership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId: user!.id, companyId } },
    });
    if (existingMembership) {
      if (existingMembership.role === "SUPERADMIN") {
        console.log("[bootstrap] SUPERADMIN membership already present — nothing further to do.");
      } else {
        throw new Error(
          `User "${email}" already has a non-SUPERADMIN membership (${existingMembership.role}) for company "${companyId}" — refusing to overwrite it automatically.`,
        );
      }
    } else {
      await prisma.userMembership.create({
        data: { userId: user!.id, companyId, role: "SUPERADMIN", isDefault: true },
      });
      console.log(`[bootstrap] Granted SUPERADMIN on company "${companyId}" to "${email}".`);
    }

    console.log("[bootstrap] Done.");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("[bootstrap] Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
