import { Injectable } from "@nestjs/common";
import { BeforeHook, Hook } from "@thallesp/nestjs-better-auth";
import { APIError } from "@medcal/auth";
import { resolveRegistrationContext } from "@medcal/shared";
import {
  getRegistrationRejectionReasonForContext,
  type RegistrationRejectionReason,
} from "./registration-gate";

/**
 * External message per rejection reason — deliberately generic, no mention
 * of EmailWhitelist/Prisma/entry status (see RegistrationRejectionReason).
 */
const REJECTION_MESSAGES: Record<RegistrationRejectionReason, string> = {
  INVALID_DOMAIN: "This email domain is not eligible for registration.",
  NOT_WHITELISTED: "This email is not authorized to register.",
  ORIGIN_NOT_ALLOWED: "Registration is not allowed from this origin.",
};

/**
 * Origin-aware registration policy — the primary Staff-vs-Customer gate.
 * Wired into Better Auth's own hooks.before (createAuthMiddleware) via
 * @BeforeHook("/sign-up/email"), which fires before the route handler and
 * gives access to the raw request headers — unlike databaseHooks.user.create
 * (registration-gate.hook.ts), which has no reliable Origin access and stays
 * as an origin-blind defense-in-depth backstop.
 *
 * Registration context is derived ONLY from ctx.headers's Origin — never
 * from ctx.body — so a client cannot spoof staff-vs-customer intent by
 * sending a "registrationContext"-style body field.
 *
 * Requires `hooks: {}` on the betterAuth(...) config (packages/auth/src/index.ts)
 * for @thallesp/nestjs-better-auth's @Hook()/@BeforeHook() providers to be
 * wired at all.
 */
@Hook()
@Injectable()
export class RegistrationOriginHook {
  @BeforeHook("/sign-up/email")
  async beforeSignUp(ctx: { headers?: Headers; body?: { email?: string } }): Promise<void> {
    const origin = ctx.headers?.get("origin") ?? null;
    const email = ctx.body?.email ?? "";
    const context = resolveRegistrationContext(origin, process.env.DEV_DEFAULT_HOST_GROUP);
    const reason = await getRegistrationRejectionReasonForContext(email, context);
    if (reason) {
      throw new APIError("FORBIDDEN", {
        message: REJECTION_MESSAGES[reason],
        code: `REGISTRATION_${reason}`,
      });
    }
  }
}
