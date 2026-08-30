import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  priceListItemCreateSchema,
  priceListItemListQuerySchema,
  priceListItemResolveQuerySchema,
  priceListItemUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  PriceListItemsService,
  type PriceListItemListResult,
  type PriceListItemWithType,
  type ResolvedPrice,
} from "./price-list-items.service";

@Controller("price-list-items")
@UseGuards(CompanyRoleGuard)
export class PriceListItemsController {
  constructor(
    @Inject(PriceListItemsService)
    private readonly service: PriceListItemsService,
  ) {}

  @Post()
  @RequirePermission("priceListItem", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<PriceListItemWithType> {
    const parsed = priceListItemCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid price list item payload",
        code: "INVALID_PRICE_LIST_ITEM",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("priceListItem", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<PriceListItemListResult> {
    const parsed = priceListItemListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid price list item query",
        code: "INVALID_PRICE_LIST_ITEM_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get("resolve")
  @RequirePermission("quotation", "read")
  async resolve(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<{ data: ResolvedPrice | null }> {
    const parsed = priceListItemResolveQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid price list resolve query",
        code: "INVALID_PRICE_LIST_RESOLVE_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    const data = await this.service.resolve(
      companyId,
      parsed.data.deviceTypeId,
      parsed.data.date ?? new Date(),
    );
    return { data };
  }

  @Get(":id")
  @RequirePermission("priceListItem", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<PriceListItemWithType> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("priceListItem", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<PriceListItemWithType> {
    const parsed = priceListItemUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid price list item update",
        code: "INVALID_PRICE_LIST_ITEM_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("priceListItem", "delete")
  async remove(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<PriceListItemWithType> {
    return this.service.remove(companyId, id);
  }
}
