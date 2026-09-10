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
  devicePhysicalCheckItemCreateSchema,
  devicePhysicalCheckItemGroupedQuerySchema,
  devicePhysicalCheckItemListQuerySchema,
  devicePhysicalCheckItemOrderSchema,
  devicePhysicalCheckItemUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DevicePhysicalCheckItemsService,
  type DevicePhysicalCheckItemGroupedResult,
  type DevicePhysicalCheckItemListResult,
  type DevicePhysicalCheckItemWithRelations,
} from "./device-physical-check-items.service";

@Controller("device-physical-check-items")
@UseGuards(CompanyRoleGuard)
export class DevicePhysicalCheckItemsController {
  constructor(
    @Inject(DevicePhysicalCheckItemsService)
    private readonly service: DevicePhysicalCheckItemsService,
  ) {}

  @Post()
  @RequirePermission("devicePhysicalCheckItem", "create")
  async create(@Body() rawBody: unknown): Promise<DevicePhysicalCheckItemWithRelations> {
    const parsed = devicePhysicalCheckItemCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device physical check item payload",
        code: "INVALID_DEVICE_PHYSICAL_CHECK_ITEM",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("devicePhysicalCheckItem", "read")
  async list(@Query() rawQuery: unknown): Promise<DevicePhysicalCheckItemListResult> {
    const parsed = devicePhysicalCheckItemListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device physical check item list query",
        code: "INVALID_DEVICE_PHYSICAL_CHECK_ITEM_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get("grouped")
  @RequirePermission("devicePhysicalCheckItem", "read")
  async listGrouped(@Query() rawQuery: unknown): Promise<DevicePhysicalCheckItemGroupedResult> {
    const parsed = devicePhysicalCheckItemGroupedQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device physical check item grouped query",
        code: "INVALID_DEVICE_PHYSICAL_CHECK_ITEM_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAllGroupedByDeviceType(parsed.data);
  }

  @Patch("device-types/:deviceTypeId/item-order")
  @RequirePermission("devicePhysicalCheckItem", "update")
  async reorder(
    @Param("deviceTypeId") deviceTypeId: string,
    @Body() rawBody: unknown,
  ): Promise<DevicePhysicalCheckItemWithRelations[]> {
    const parsed = devicePhysicalCheckItemOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid physical check item order payload",
        code: "INVALID_DEVICE_PHYSICAL_CHECK_ITEM_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reorder(deviceTypeId, parsed.data.itemIds);
  }

  @Get(":id")
  @RequirePermission("devicePhysicalCheckItem", "read")
  async findOne(@Param("id") id: string): Promise<DevicePhysicalCheckItemWithRelations> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("devicePhysicalCheckItem", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DevicePhysicalCheckItemWithRelations> {
    const parsed = devicePhysicalCheckItemUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device physical check item update",
        code: "INVALID_DEVICE_PHYSICAL_CHECK_ITEM_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("devicePhysicalCheckItem", "delete")
  async remove(@Param("id") id: string): Promise<DevicePhysicalCheckItemWithRelations> {
    return this.service.remove(id);
  }
}
