import { Injectable } from "@nestjs/common";
import { BeforeCreate, DatabaseHook } from "@thallesp/nestjs-better-auth";
import { APIError } from "@medcal/auth";
import { getRegistrationRejectionReason, type RegistrationRejectionReason } from "./registration-gate";

/**
 * External message per rejection reason — deliberately generic, no mention
 * of EmailWhitelist/Prisma/entry status (see RegistrationRejectionReason).
 */
const REJECTION_MESSAGES: Record<RegistrationRejectionReason, string> = {
  INVALID_DOMAIN: "This email domain is not eligible for registration.",
  NOT_WHITELISTED: "This email is not authorized to register.",
};

/**
 * Wires getRegistrationRejectionReason (see ./registration-gate.ts) into
 * Better Auth's databaseHooks.user.create.before — see packages/auth/src/index.ts
 * for the required (even empty) databaseHooks config this depends on.
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
  async beforeUserCreate(user: { email: string } & Record<string, unknown>): Promise<void> {
    const reason = await getRegistrationRejectionReason(user.email);
    if (reason) {
      throw new APIError("FORBIDDEN", {
        message: REJECTION_MESSAGES[reason],
        code: `REGISTRATION_${reason}`,
      });
    }
  }
}
