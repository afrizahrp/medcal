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
  deviceTypeCreateSchema,
  deviceTypeListQuerySchema,
  deviceTypeUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceTypesService,
  type DeviceTypeListResult,
  type DeviceTypeWithCategory,
} from "./device-types.service";

@Controller("device-types")
@UseGuards(CompanyRoleGuard)
export class DeviceTypesController {
  constructor(
    @Inject(DeviceTypesService)
    private readonly service: DeviceTypesService,
  ) {}

  @Post()
  @RequirePermission("deviceType", "create")
  async create(@Body() rawBody: unknown): Promise<DeviceTypeWithCategory> {
    const parsed = deviceTypeCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device type payload",
        code: "INVALID_DEVICE_TYPE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("deviceType", "read")
  async list(@Query() rawQuery: unknown): Promise<DeviceTypeListResult> {
    const parsed = deviceTypeListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device type list query",
        code: "INVALID_DEVICE_TYPE_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get(":id")
  @RequirePermission("deviceType", "read")
  async findOne(@Param("id") id: string): Promise<DeviceTypeWithCategory> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("deviceType", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceTypeWithCategory> {
    const parsed = deviceTypeUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device type update",
        code: "INVALID_DEVICE_TYPE_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("deviceType", "delete")
  async remove(@Param("id") id: string): Promise<DeviceTypeWithCategory> {
    return this.service.remove(id);
  }
}
