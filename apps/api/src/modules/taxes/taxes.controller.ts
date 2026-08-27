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
import { taxCreateSchema, taxListQuerySchema, taxUpdateSchema } from "@medcal/shared";
import type { Tax } from "@medcal/db";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { TaxesService, type TaxListResult } from "./taxes.service";

@Controller("taxes")
@UseGuards(CompanyRoleGuard)
export class TaxesController {
  constructor(
    @Inject(TaxesService)
    private readonly service: TaxesService,
  ) {}

  @Post()
  @RequirePermission("tax", "manage")
  async create(@CompanyId() companyId: string, @Body() rawBody: unknown): Promise<Tax> {
    const parsed = taxCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid tax payload",
        code: "INVALID_TAX",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("tax", "manage")
  async list(@CompanyId() companyId: string, @Query() rawQuery: unknown): Promise<TaxListResult> {
    const parsed = taxListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid tax list query",
        code: "INVALID_TAX_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get("options")
  @RequirePermission("quotation", "read")
  async options(@CompanyId() companyId: string): Promise<{ data: Tax[] }> {
    const data = await this.service.listActive(companyId);
    return { data };
  }

  @Get(":id")
  @RequirePermission("tax", "manage")
  async findOne(@CompanyId() companyId: string, @Param("id") id: string): Promise<Tax> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("tax", "manage")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<Tax> {
    const parsed = taxUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid tax update",
        code: "INVALID_TAX_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }
}
