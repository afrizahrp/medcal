import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { UsersService, type UserListResult, type UserListRow } from "./users.service";

const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).optional(),
  role: z
    .enum([
      "SUPERADMIN",
      "ADMIN",
      "SUPERVISOR",
      "TECHNICIAN",
      "TECHNICIAN_MANAGER",
      "FINANCE",
      "CUSTOMER",
      "CUSTOMER_SERVICE",
    ])
    .optional(),
});

const userStatusUpdateSchema = z.object({
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]),
});

const membershipRoleValues = [
  "ADMIN",
  "SUPERVISOR",
  "TECHNICIAN",
  "TECHNICIAN_MANAGER",
  "FINANCE",
  "CUSTOMER",
  "CUSTOMER_SERVICE",
] as const;

const membershipAssignSchema = z.object({
  role: z.enum(membershipRoleValues),
});

const membershipUpdateSchema = z.object({
  role: z.enum(membershipRoleValues),
});

const membershipNotificationSettingsSchema = z.object({
  receiveNotifications: z.boolean(),
});

@Controller("users")
@UseGuards(CompanyRoleGuard)
export class UsersController {
  constructor(
    @Inject(UsersService)
    private readonly service: UsersService,
  ) {}

  @Get()
  @RequirePermission("users", "read")
  async list(@CompanyId() companyId: string, @Query() rawQuery: unknown): Promise<UserListResult> {
    const parsed = userListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid user list query",
        code: "INVALID_USER_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get("without-membership")
  @RequirePermission("membership", "manage")
  async listWithoutMembership(@CompanyId() companyId: string) {
    return this.service.findUsersWithoutMembership(companyId);
  }

  @Get(":id")
  @RequirePermission("users", "read")
  async findOne(@CompanyId() companyId: string, @Param("id") id: string): Promise<UserListRow> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id/status")
  @RequirePermission("users", "manage")
  async updateStatus(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = userStatusUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid status value",
        code: "INVALID_STATUS",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateStatus(companyId, id, parsed.data.status);
  }

  @Post(":id/memberships")
  @RequirePermission("membership", "manage")
  async assignMembership(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = membershipAssignSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid membership data",
        code: "INVALID_MEMBERSHIP",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.assignMembership(companyId, id, parsed.data.role);
  }

  @Patch(":id/memberships")
  @RequirePermission("membership", "manage")
  async updateMembershipRole(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = membershipUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid role value",
        code: "INVALID_ROLE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateMembershipRole(companyId, id, parsed.data.role);
  }

  @Patch(":id/memberships/notification-settings")
  @RequirePermission("membership", "manage")
  async updateMembershipNotificationSettings(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = membershipNotificationSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid notification settings",
        code: "INVALID_NOTIFICATION_SETTINGS",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateMembershipNotificationSettings(
      companyId,
      id,
      parsed.data.receiveNotifications,
    );
  }

  @Delete(":id/memberships")
  @HttpCode(204)
  @RequirePermission("membership", "manage")
  async removeMembership(@CompanyId() companyId: string, @Param("id") id: string) {
    await this.service.removeMembership(companyId, id);
  }
}
