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
  deviceTypeAliasCreateSchema,
  deviceTypeAliasGroupedQuerySchema,
  deviceTypeAliasListQuerySchema,
  deviceTypeAliasUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceTypeAliasesService,
  type DeviceTypeAliasGroupedResult,
  type DeviceTypeAliasListResult,
  type DeviceTypeAliasWithType,
} from "./device-type-aliases.service";

@Controller("device-type-aliases")
@UseGuards(CompanyRoleGuard)
export class DeviceTypeAliasesController {
  constructor(
    @Inject(DeviceTypeAliasesService)
    private readonly service: DeviceTypeAliasesService,
  ) {}

  @Post()
  @RequirePermission("deviceTypeAlias", "create")
  async create(@Body() rawBody: unknown): Promise<DeviceTypeAliasWithType> {
    const parsed = deviceTypeAliasCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device type alias payload",
        code: "INVALID_DEVICE_TYPE_ALIAS",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("deviceTypeAlias", "read")
  async list(@Query() rawQuery: unknown): Promise<DeviceTypeAliasListResult> {
    const parsed = deviceTypeAliasListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device type alias list query",
        code: "INVALID_DEVICE_TYPE_ALIAS_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get("grouped")
  @RequirePermission("deviceTypeAlias", "read")
  async listGrouped(@Query() rawQuery: unknown): Promise<DeviceTypeAliasGroupedResult> {
    const parsed = deviceTypeAliasGroupedQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device type alias grouped query",
        code: "INVALID_DEVICE_TYPE_ALIAS_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAllGroupedByDeviceType(parsed.data);
  }

  @Get(":id")
  @RequirePermission("deviceTypeAlias", "read")
  async findOne(@Param("id") id: string): Promise<DeviceTypeAliasWithType> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("deviceTypeAlias", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceTypeAliasWithType> {
    const parsed = deviceTypeAliasUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device type alias update",
        code: "INVALID_DEVICE_TYPE_ALIAS_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("deviceTypeAlias", "delete")
  async remove(@Param("id") id: string): Promise<DeviceTypeAliasWithType> {
    return this.service.remove(id);
  }
}
