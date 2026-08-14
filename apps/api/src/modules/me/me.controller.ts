import { Controller, ForbiddenException, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@medcal/auth";
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
    });
    if (!membership) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    return {
      user: session.user,
      membership: { role: membership.role, companyId: membership.companyId },
    };
  }
}
