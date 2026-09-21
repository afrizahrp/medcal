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
  deviceManufacturerCreateSchema,
  deviceManufacturerListQuerySchema,
  deviceManufacturerUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceManufacturersService,
  type DeviceManufacturerListResult,
} from "./device-manufacturers.service";

@Controller("device-manufacturers")
@UseGuards(CompanyRoleGuard)
export class DeviceManufacturersController {
  constructor(
    @Inject(DeviceManufacturersService)
    private readonly service: DeviceManufacturersService,
  ) {}

  @Post()
  @RequirePermission("deviceManufacturer", "create")
  async create(@Body() rawBody: unknown) {
    const parsed = deviceManufacturerCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device manufacturer payload",
        code: "INVALID_DEVICE_MANUFACTURER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("deviceManufacturer", "read")
  async list(@Query() rawQuery: unknown): Promise<DeviceManufacturerListResult> {
    const parsed = deviceManufacturerListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device manufacturer list query",
        code: "INVALID_DEVICE_MANUFACTURER_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get(":id")
  @RequirePermission("deviceManufacturer", "read")
  async findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("deviceManufacturer", "update")
  async update(@Param("id") id: string, @Body() rawBody: unknown) {
    const parsed = deviceManufacturerUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device manufacturer update",
        code: "INVALID_DEVICE_MANUFACTURER_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("deviceManufacturer", "delete")
  async remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
