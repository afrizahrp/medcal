import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

/**
 * Trust boundary for service-to-service internal routes (e.g. apps/web-api ->
 * apps/api), not a Better Auth session. Validates x-internal-secret, then
 * attaches companyId to the request for @CompanyId() to read. Routes using
 * this guard must also be @AllowAnonymous() since there is no Better Auth
 * session on this path.
 *
 * companyId is resolved ONLY from this deployment's own COMPANY_ID env var —
 * never from a client-supplied header — identical to CompanyRoleGuard's
 * derivation on the authenticated path. This deployment is single-tenant-per-
 * process, so there is no legitimate reason for a caller to specify which
 * tenant a write belongs to; accepting it as request data (the prior
 * x-company-id header) was an unnecessary trust surface, not a real
 * requirement.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const expected = process.env.INTERNAL_API_SECRET ?? "";
    const secret = request.headers["x-internal-secret"];
    if (!expected || secret !== expected) {
      throw new UnauthorizedException("Invalid internal secret");
    }

    const companyId = process.env.COMPANY_ID;
    if (!companyId) {
      throw new UnauthorizedException("Missing company id");
    }

    request.companyId = companyId;
    return true;
  }
}
