import { Injectable } from "@nestjs/common";
import { BeforeCreate, DatabaseHook } from "@thallesp/nestjs-better-auth";
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
 * Wires the SAME context-aware policy as registration-origin.hook.ts's
 * @BeforeHook("/sign-up/email") into Better Auth's databaseHooks.user.create.before
 * — see packages/auth/src/index.ts for the required (even empty) databaseHooks
 * config this depends on.
 *
 * Deliberately context-aware here too, not origin-blind (2A fix): Better
 * Auth's own dispatch (`runBeforeHooks` before `endpoint(...)`, see
 * better-auth/dist/api/dispatch.mjs) means @BeforeHook only ever *rejects*
 * before this hook runs — it never proves anything about what this hook
 * should ALLOW. When @BeforeHook allows a CUSTOMER_PORTAL + company-domain
 * signup through, the request still reaches this hook on its way into the DB
 * write. If this hook stayed origin-blind ("company domain always requires
 * whitelist"), it would silently re-reject the exact case @BeforeHook just
 * allowed — the double-gate contradiction identified in review. So this hook
 * re-derives the same registration context from the second argument Better
 * Auth's own with-hooks.mjs passes to databaseHooks.create.before
 * (`toRun(data, context)`, where `context` is the ALS-backed
 * getCurrentAuthContext() result — see @better-auth/core/context/endpoint-context.mjs
 * — the same object @BeforeHook's ctx.headers reads from) rather than
 * re-implementing the origin-blind rule.
 *
 * Fails closed (ORIGIN_NOT_ALLOWED) if that context argument is ever absent
 * — e.g. a hypothetical future user-creation path that bypasses
 * dispatchAuthEndpoint (and therefore @BeforeHook) entirely, such as a direct
 * Prisma write. No currently-registered path does this.
 *
 * Throws Better Auth's own APIError instead of returning false: Better Auth's
 * sign-up route rethrows APIError instances verbatim (isAPIError(e) check in
 * its internalAdapter.createUser try/catch), so our stable code/message reach
 * the client; returning false instead collapses into a generic
 * FAILED_TO_CREATE_USER for every rejection reason. Throwing here aborts
 * user creation before any row is written — same as the previous `false`
 * behavior, zero User rows either way.
 */
@DatabaseHook()
@Injectable()
export class RegistrationGateHook {
  @BeforeCreate("user")
  async beforeUserCreate(
    user: { email: string } & Record<string, unknown>,
    authContext?: { headers?: Headers } | null,
  ): Promise<void> {
    const origin = authContext?.headers?.get("origin") ?? null;
    const context = resolveRegistrationContext(origin, process.env.DEV_DEFAULT_HOST_GROUP);
    const reason = await getRegistrationRejectionReasonForContext(user.email, context);
    if (reason) {
      throw new APIError("FORBIDDEN", {
        message: REJECTION_MESSAGES[reason],
        code: `REGISTRATION_${reason}`,
      });
    }
  }
}
