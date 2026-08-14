import { Injectable } from "@nestjs/common";
import { BeforeCreate, DatabaseHook } from "@thallesp/nestjs-better-auth";
import { isRegistrationAllowed } from "./registration-gate";

/**
 * Wires isRegistrationAllowed (see ./registration-gate.ts) into Better Auth's
 * databaseHooks.user.create.before — see packages/auth/src/index.ts for the
 * required (even empty) databaseHooks config this depends on.
 */
@DatabaseHook()
@Injectable()
export class RegistrationGateHook {
  @BeforeCreate("user")
  async beforeUserCreate(user: { email: string } & Record<string, unknown>): Promise<boolean | void> {
    if (!(await isRegistrationAllowed(user.email))) {
      return false;
    }
  }
}
