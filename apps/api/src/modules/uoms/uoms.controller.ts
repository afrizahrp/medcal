import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  uomCreateSchema,
  uomListQuerySchema,
  uomUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  UomsService,
  type UomListResult,
} from "./uoms.service";
import type { Uom } from "@medcal/db";

@Controller("uoms")
@UseGuards(CompanyRoleGuard)
export class UomsController {
  constructor(
    @Inject(UomsService)
    private readonly service: UomsService,
  ) {}

  @Post()
  @RequirePermission("uom", "create")
  async create(@Body() rawBody: unknown): Promise<Uom> {
    const parsed = uomCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid UOM payload",
        code: "INVALID_UOM",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("uom", "read")
  async list(@Query() rawQuery: unknown): Promise<UomListResult> {
    const parsed = uomListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid UOM list query",
        code: "INVALID_UOM_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get(":id")
  @RequirePermission("uom", "read")
  async findOne(@Param("id") id: string): Promise<Uom> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("uom", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<Uom> {
    const parsed = uomUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid UOM update",
        code: "INVALID_UOM_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }
}
