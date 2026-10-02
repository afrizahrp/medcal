/**
 * Minto Hardjo High-Volume Trial — sets login passwords for the trial
 * technician/manager Users that `lib.ts`'s `ensureTrialUsers()` creates.
 *
 * `ensureTrialUsers()` only upserts the `User` row (id, email, name, status) —
 * it never creates a Better Auth credential `Account` row, so these trial
 * users have never been able to log in at all. This script adds exactly that
 * one missing piece, nothing else: no role/RBAC change (UserMembership rows
 * are untouched), no schema change, no new user created if one doesn't
 * already exist.
 *
 * Uses Better Auth's OWN internal password hashing + account-write functions
 * (`ctx.password.hash`, `ctx.internalAdapter.createAccount` /
 * `updatePassword`) — the exact same primitives Better Auth's own
 * `/reset-password` endpoint uses internally — rather than hand-hashing or
 * writing a plaintext password to the `Account.password` column. It does not
 * go through `auth.api.signUpEmail()` (used by bootstrap-superadmin.ts)
 * because that re-runs the company-domain registration gate, which would
 * reject these `@medcal.test` trial emails outright; these Users already
 * exist, so only a credential needs to be attached to them.
 *
 * Run manually:
 *   pnpm --filter @medcal/api exec tsx --env-file=../../.env scripts/trial-minto-hardjo/set-trial-credentials.ts
 */
import "reflect-metadata";
import { auth } from "@medcal/auth";
import { prisma } from "@medcal/db";

// Trial login passwords are supplied at run time, never stored in source:
//   TRIAL_CREDENTIALS_JSON='{"trial-mh-tech-1":"<password>", ...}'
// Keys are the six seeded trial User ids (trial-mh-tech-1..4, trial-mh-manager-1..2).
function loadCredentials(): Record<string, string> {
  const raw = process.env.TRIAL_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error("TRIAL_CREDENTIALS_JSON is required (JSON object of userId -> password).");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("TRIAL_CREDENTIALS_JSON must be a JSON object of userId -> password.");
  }
  return parsed as Record<string, string>;
}

async function main(): Promise<void> {
  const ctx = await auth.$context;
  const credentials = loadCredentials();

  for (const [userId, password] of Object.entries(credentials)) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.error(`[set-trial-credentials] Skipping "${userId}": User does not exist (run seed first).`);
      continue;
    }

    const hashed = await ctx.password.hash(password);
    const existingAccounts = await ctx.internalAdapter.findAccounts(userId);
    const credentialAccount = existingAccounts.find((a: { providerId: string }) => a.providerId === "credential");

    if (credentialAccount) {
      await ctx.internalAdapter.updatePassword(userId, hashed);
      console.log(`[set-trial-credentials] Updated password for "${userId}" (${user.email}).`);
    } else {
      await ctx.internalAdapter.createAccount({
        userId,
        providerId: "credential",
        accountId: userId,
        password: hashed,
      });
      console.log(`[set-trial-credentials] Created credential for "${userId}" (${user.email}).`);
    }
  }

  console.log("[set-trial-credentials] Done.");
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[set-trial-credentials] FAILED:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { main as setTrialCredentials };
