import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Reads the companyId resolved by whichever guard ran on this route
 * (InternalServiceGuard for service-to-service trust, CompanyRoleGuard for
 * session-based routes) — controllers never read companyId from the raw
 * request themselves.
 */
export const CompanyId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.companyId;
});
