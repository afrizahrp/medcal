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
 *
 * Always enforces: session + ACTIVE membership for COMPANY_ID, and injects
 * request.userId / request.companyId / request.membershipRole.
 * When @RequirePermission is present, also checks the catalog grant.
 * When absent (e.g. own-resource routes like push-token registration),
 * authentication + ACTIVE status alone are sufficient.
 */
@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

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
      include: { user: { select: { status: true } } },
    });
    if (!membership) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    // G5: access requires ACTIVE + membership. INVITED is not authorized.
    if (membership.user.status !== "ACTIVE") {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    if (required && !hasPermission(membership.role, required.resource as never, required.action)) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    request.companyId = membership.companyId;
    request.membershipRole = membership.role;
    request.userId = session.user.id;
    return true;
  }
}
