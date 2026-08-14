import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { auth } from "@medcal/auth";
import type { EmailWhitelist } from "@medcal/db";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { WhitelistService } from "./whitelist.service";

// EmailWhitelist has no companyId — CompanyRoleGuard is used here purely for
// its role/permission resolution (superadmin-only), not for data scoping.
@Controller("whitelist")
@RequirePermission("whitelist", "manage")
@UseGuards(CompanyRoleGuard)
export class WhitelistController {
  constructor(
    @Inject(WhitelistService)
    private readonly service: WhitelistService,
  ) {}

  @Get()
  async list(): Promise<EmailWhitelist[]> {
    return this.service.findAll();
  }

  @Post()
  async create(
    @Body("email") email: string,
    @Session() session: UserSession<typeof auth>,
  ): Promise<EmailWhitelist> {
    return this.service.create(email, session.user.id);
  }

  @Post(":id/revoke")
  async revoke(
    @Param("id") id: string,
    @Session() session: UserSession<typeof auth>,
  ): Promise<EmailWhitelist> {
    return this.service.revoke(id, session.user.id);
  }
}
