import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { MembershipRole } from "@medcal/db";

/** Membership role resolved by CompanyRoleGuard. */
export const MembershipRoleParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MembershipRole => {
    const request = ctx.switchToHttp().getRequest();
    return request.membershipRole;
  },
);
