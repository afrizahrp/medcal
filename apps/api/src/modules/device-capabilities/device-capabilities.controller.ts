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
  deviceCapabilityCreateSchema,
  deviceCapabilityItemCreateSchema,
  deviceCapabilityItemUpdateSchema,
  deviceCapabilityListQuerySchema,
  deviceCapabilityUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceCapabilitiesService,
  type DeviceCapabilityItemRow,
  type DeviceCapabilityListResult,
  type DeviceCapabilityWithItems,
} from "./device-capabilities.service";

@Controller("device-capabilities")
@UseGuards(CompanyRoleGuard)
export class DeviceCapabilitiesController {
  constructor(
    @Inject(DeviceCapabilitiesService)
    private readonly service: DeviceCapabilitiesService,
  ) {}

  @Post()
  @RequirePermission("deviceCapability", "create")
  async create(@Body() rawBody: unknown): Promise<DeviceCapabilityWithItems> {
    const parsed = deviceCapabilityCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device capability payload",
        code: "INVALID_DEVICE_CAPABILITY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("deviceCapability", "read")
  async list(@Query() rawQuery: unknown): Promise<DeviceCapabilityListResult> {
    const parsed = deviceCapabilityListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device capability list query",
        code: "INVALID_DEVICE_CAPABILITY_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get(":id/items")
  @RequirePermission("deviceCapabilityItem", "read")
  async listItems(@Param("id") id: string): Promise<DeviceCapabilityItemRow[]> {
    return this.service.findItems(id);
  }

  @Post(":id/items")
  @RequirePermission("deviceCapabilityItem", "create")
  async createItem(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceCapabilityItemRow> {
    const parsed = deviceCapabilityItemCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device capability item payload",
        code: "INVALID_DEVICE_CAPABILITY_ITEM",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.createItem(id, parsed.data);
  }

  @Patch(":id/items/:itemId")
  @RequirePermission("deviceCapabilityItem", "update")
  async updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceCapabilityItemRow> {
    const parsed = deviceCapabilityItemUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device capability item update",
        code: "INVALID_DEVICE_CAPABILITY_ITEM_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateItem(id, itemId, parsed.data);
  }

  @Delete(":id/items/:itemId")
  @RequirePermission("deviceCapabilityItem", "delete")
  async removeItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ): Promise<DeviceCapabilityItemRow> {
    return this.service.removeItem(id, itemId);
  }

  @Get(":id")
  @RequirePermission("deviceCapability", "read")
  async findOne(@Param("id") id: string): Promise<DeviceCapabilityWithItems> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("deviceCapability", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceCapabilityWithItems> {
    const parsed = deviceCapabilityUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device capability update",
        code: "INVALID_DEVICE_CAPABILITY_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("deviceCapability", "delete")
  async remove(@Param("id") id: string): Promise<DeviceCapabilityWithItems> {
    return this.service.remove(id);
  }
}
