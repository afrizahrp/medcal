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
import type { AdditionalItemType } from "@medcal/db";
import {
  additionalItemTypeCreateSchema,
  additionalItemTypeListQuerySchema,
  additionalItemTypeUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  AdditionalItemTypesService,
  type AdditionalItemTypeListResult,
} from "./additional-item-types.service";

/**
 * Maintenance is governed by the dedicated `additionalItemType` permissions
 * (read / create / update — no delete: types are deactivated). The LIST is
 * readable with `quotation:read` — the same precedent as
 * GET /price-list-items/resolve — because quotation staff must load the active
 * types to add a line even when they cannot maintain the catalog.
 */
@Controller("additional-item-types")
@UseGuards(CompanyRoleGuard)
export class AdditionalItemTypesController {
  constructor(
    @Inject(AdditionalItemTypesService)
    private readonly service: AdditionalItemTypesService,
  ) {}

  @Post()
  @RequirePermission("additionalItemType", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<AdditionalItemType> {
    const parsed = additionalItemTypeCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid additional item type payload",
        code: "INVALID_ADDITIONAL_ITEM_TYPE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("quotation", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<AdditionalItemTypeListResult> {
    const parsed = additionalItemTypeListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid additional item type query",
        code: "INVALID_ADDITIONAL_ITEM_TYPE_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("additionalItemType", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<AdditionalItemType> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("additionalItemType", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<AdditionalItemType> {
    const parsed = additionalItemTypeUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid additional item type update",
        code: "INVALID_ADDITIONAL_ITEM_TYPE_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }
}
