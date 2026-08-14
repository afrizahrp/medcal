import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

/**
 * Trust boundary for service-to-service internal routes (e.g. apps/web-api ->
 * apps/api), not a Better Auth session. Validates x-internal-secret and the
 * presence of x-company-id, then attaches the resolved companyId to the
 * request for @CompanyId() to read. Routes using this guard must also be
 * @AllowAnonymous() since there is no Better Auth session on this path.
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

    const companyId = request.headers["x-company-id"];
    if (!companyId) {
      throw new UnauthorizedException("Missing company id");
    }

    request.companyId = companyId;
    return true;
  }
}
