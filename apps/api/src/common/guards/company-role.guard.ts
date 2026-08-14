import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import { auth, hasPermission } from "@medcal/auth";
import { prisma } from "@medcal/db";
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from "../decorators/require-permission.decorator";

const FORBIDDEN_MESSAGE = "Forbidden";

/**
 * Session-based RBAC + companyId enforcement. companyId is resolved ONLY from
 * the caller's own UserMembership for this deployment's bound COMPANY_ID —
 * never from a client-supplied header/param (the Adoption Matrix explicitly
 * calls out client-supplied company_id trust as a Do-Not-Copy anti-pattern).
 */
@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const companyId = process.env.COMPANY_ID;
    if (!companyId) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
    });
    if (!membership) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    if (!hasPermission(membership.role, required.resource as never, required.action)) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    request.companyId = membership.companyId;
    request.membershipRole = membership.role;
    return true;
  }
}
