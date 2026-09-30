/**
 * Minto Hardjo High-Volume Trial — adds the trial staff/technician/manager
 * emails to EmailWhitelist so they can be assigned roles/permissions through
 * the normal whitelist:manage flow.
 *
 * Reuses the real `WhitelistService.create()` (same validation — domain check,
 * normalization, uniqueness — as the `/whitelist` API route) rather than
 * writing directly to `EmailWhitelist` via Prisma. Per the EmailWhitelist
 * schema comment, `createdBy` must be a real user for any entry created
 * through this normal flow (NULL is reserved for the one-time
 * bootstrap-superadmin case) — attributed here to the acting SUPERADMIN.
 *
 * Run manually:
 *   pnpm --filter @medcal/api exec tsx --env-file=../../.env scripts/trial-minto-hardjo/add-to-whitelist.ts -- --createdBy=<userId>
 */
import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import { WhitelistService } from "../../src/modules/whitelist/whitelist.service";
import {
  TRIAL_STAFF_USER_ID,
  TRIAL_TECHNICIAN_USER_IDS,
  TRIAL_MANAGER_USER_IDS,
} from "./lib";

const TRIAL_USER_IDS = [TRIAL_STAFF_USER_ID, ...TRIAL_TECHNICIAN_USER_IDS, ...TRIAL_MANAGER_USER_IDS];

function parseCreatedBy(argv: string[]): string {
  const match = argv.map((a) => /^--createdBy=(.*)$/.exec(a)).find(Boolean);
  if (!match) throw new Error("Missing required --createdBy=<userId> (the acting SUPERADMIN/ADMIN user id).");
  return match[1]!;
}

async function main(): Promise<void> {
  const createdBy = parseCreatedBy(process.argv.slice(2));
  const actingUser = await prisma.user.findUnique({ where: { id: createdBy } });
  if (!actingUser) {
    throw new Error(`--createdBy user "${createdBy}" does not exist.`);
  }

  const whitelistService = new WhitelistService();

  for (const userId of TRIAL_USER_IDS) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.error(`[add-to-whitelist] Skipping "${userId}": User does not exist.`);
      continue;
    }
    try {
      await whitelistService.create(user.email, createdBy);
      console.log(`[add-to-whitelist] Added "${user.email}" to EmailWhitelist.`);
    } catch (err) {
      if (err instanceof ConflictException) {
        console.log(`[add-to-whitelist] "${user.email}" is already on the EmailWhitelist — skipped.`);
      } else {
        throw err;
      }
    }
  }

  console.log("[add-to-whitelist] Done.");
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[add-to-whitelist] FAILED:", err instanceof Error ? err.message : err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { main as addTrialUsersToWhitelist };
