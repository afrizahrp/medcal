import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth, permissionCatalog } from "@medcal/auth";
import { prisma } from "@medcal/db";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { MenuService } from "./menu.service";

const FORBIDDEN_MESSAGE = "Forbidden";

const menuApplicationEnum = z.enum(["MANAGEMENT", "TECHNICIAN", "CUSTOMER"]);

const navQuerySchema = z.object({ application: menuApplicationEnum });
const adminListQuerySchema = z.object({ application: menuApplicationEnum.optional() });

const menuCreateSchema = z.object({
  application: menuApplicationEnum,
  code: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  label: z.string().min(1),
  href: z.string().min(1).nullable().optional(),
  icon: z.string().min(1).nullable().optional(),
  order: z.number().int().min(0).optional(),
  isGroup: z.boolean().optional(),
  isActive: z.boolean().optional(),
  viewResource: z.string().min(1).nullable().optional(),
  viewAction: z.string().min(1).nullable().optional(),
});

const menuUpdateSchema = menuCreateSchema.omit({ application: true }).partial();

// Unlike WhitelistController, @RequirePermission is NOT set at class level —
// GET /menu/nav is intentionally ungated by it (any ACTIVE member fetches
// their own permission-filtered nav; see getNav()'s inline session check,
// which mirrors MeController's duplicated resolve-session pattern). Every
// other route below requires menu:manage explicitly.
@Controller("menu")
@UseGuards(CompanyRoleGuard)
export class MenuController {
  constructor(
    @Inject(MenuService)
    private readonly service: MenuService,
  ) {}

  @Get("nav")
  async getNav(@Req() request: Request, @Query() rawQuery: unknown) {
    const parsed = navQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid application",
        code: "INVALID_APPLICATION",
        issues: parsed.error.flatten(),
      });
    }

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

    return this.service.getNavTree(parsed.data.application, membership.role);
  }

  @Get("permissions-catalog")
  @RequirePermission("menu", "manage")
  getPermissionsCatalog() {
    return permissionCatalog;
  }

  @Get()
  @RequirePermission("menu", "manage")
  async list(@Query() rawQuery: unknown) {
    const parsed = adminListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid menu list query",
        code: "INVALID_MENU_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.listAdmin(parsed.data.application);
  }

  @Get(":id")
  @RequirePermission("menu", "manage")
  async findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission("menu", "manage")
  async create(@Body() rawBody: unknown, @Session() session: UserSession<typeof auth>) {
    const parsed = menuCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid menu data",
        code: "INVALID_MENU",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data, session.user.id);
  }

  @Patch(":id")
  @RequirePermission("menu", "manage")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
    @Session() session: UserSession<typeof auth>,
  ) {
    const parsed = menuUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid menu data",
        code: "INVALID_MENU",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data, session.user.id);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("menu", "manage")
  async remove(@Param("id") id: string) {
    await this.service.remove(id);
  }
}
