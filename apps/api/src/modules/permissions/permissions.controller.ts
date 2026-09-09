import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth, permissionCatalog } from "@medcal/auth";
import type { MembershipRole } from "@medcal/db";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { PermissionsService } from "./permissions.service";

const roleEnum = z.enum([
  "SUPERADMIN",
  "ADMIN",
  "SUPERVISOR",
  "TECHNICIAN",
  "TECHNICIAN_MANAGER",
  "FINANCE",
  "CUSTOMER",
  "CUSTOMER_SERVICE",
]);

const replaceGrantsSchema = z.object({
  grants: z.array(
    z.object({
      resource: z.string().min(1),
      action: z.string().min(1),
    }),
  ),
});

// Every route (including GET) requires permission:manage — this API itself
// is the security-sensitive surface that decides what every other role can
// do, so unlike Menu Registry's GET /menu/nav, there is no ungated read path.
@Controller("permissions")
@RequirePermission("permission", "manage")
@UseGuards(CompanyRoleGuard)
export class PermissionsController {
  constructor(
    @Inject(PermissionsService)
    private readonly service: PermissionsService,
  ) {}

  @Get("catalog")
  getCatalog() {
    return permissionCatalog;
  }

  @Get("roles")
  async listRoles() {
    return this.service.listRoles();
  }

  @Get("roles/:role")
  async getRole(@Param("role") rawRole: string) {
    const parsed = roleEnum.safeParse(rawRole);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid role", code: "INVALID_ROLE" });
    }
    return this.service.getRole(parsed.data as MembershipRole);
  }

  @Put("roles/:role")
  async replaceRole(
    @Param("role") rawRole: string,
    @Body() rawBody: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    const parsedRole = roleEnum.safeParse(rawRole);
    if (!parsedRole.success) {
      throw new BadRequestException({ message: "Invalid role", code: "INVALID_ROLE" });
    }
    const parsedBody = replaceGrantsSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      throw new BadRequestException({
        message: "Invalid grants",
        code: "INVALID_GRANTS",
        issues: parsedBody.error.flatten(),
      });
    }
    return this.service.replaceRole(
      parsedRole.data as MembershipRole,
      parsedBody.data.grants,
      session.user.id,
    );
  }
}
