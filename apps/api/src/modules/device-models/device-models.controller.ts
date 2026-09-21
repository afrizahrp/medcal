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
  deviceModelCreateSchema,
  deviceModelListQuerySchema,
  deviceModelUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceModelsService,
  type DeviceModelListResult,
  type DeviceModelWithManufacturer,
} from "./device-models.service";

@Controller("device-models")
@UseGuards(CompanyRoleGuard)
export class DeviceModelsController {
  constructor(
    @Inject(DeviceModelsService)
    private readonly service: DeviceModelsService,
  ) {}

  @Post()
  @RequirePermission("deviceModel", "create")
  async create(@Body() rawBody: unknown): Promise<DeviceModelWithManufacturer> {
    const parsed = deviceModelCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device model payload",
        code: "INVALID_DEVICE_MODEL",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("deviceModel", "read")
  async list(@Query() rawQuery: unknown): Promise<DeviceModelListResult> {
    const parsed = deviceModelListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device model list query",
        code: "INVALID_DEVICE_MODEL_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get(":id")
  @RequirePermission("deviceModel", "read")
  async findOne(@Param("id") id: string): Promise<DeviceModelWithManufacturer> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("deviceModel", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceModelWithManufacturer> {
    const parsed = deviceModelUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device model update",
        code: "INVALID_DEVICE_MODEL_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("deviceModel", "delete")
  async remove(@Param("id") id: string): Promise<DeviceModelWithManufacturer> {
    return this.service.remove(id);
  }
}
