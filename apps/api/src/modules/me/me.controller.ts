import { Controller, ForbiddenException, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, hasPermission } from "@medcal/auth";
import { prisma } from "@medcal/db";

const FORBIDDEN_MESSAGE = "Forbidden";

// "Who am I" — no permission to check, just the caller's own session +
// membership. Protected by the default global AuthGuard only (401 if no
// session); reuses the same lookup CompanyRoleGuard already performs.
@Controller("me")
export class MeController {
  @Get()
  async getMe(@Req() request: Request) {
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

    // Minimal, narrowly-scoped client-safe capability signal — NOT a general
    // permission-check API. Only the two booleans concrete non-menu UI
    // surfaces (Dashboard shortcuts, header notification icons) actually need
    // today, computed via the existing hasPermission catalog. Do not widen
    // this into an arbitrary "check any resource:action" endpoint or a full
    // permissions array — menu visibility already goes through /menu/nav;
    // this exists only for surfaces that aren't Menu Registry items.
    const capabilities = {
      leadRead: hasPermission(membership.role, "lead", "read"),
      chatRead: hasPermission(membership.role, "chat", "read"),
    };

    return {
      user: session.user,
      membership: { role: membership.role, companyId: membership.companyId },
      capabilities,
    };
  }
}
