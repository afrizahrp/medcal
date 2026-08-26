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
import { deviceCreateSchema, deviceListQuerySchema, deviceUpdateSchema } from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DevicesService,
  type DeviceListResult,
  type DeviceWithRelations,
} from "./devices.service";

@Controller("devices")
@UseGuards(CompanyRoleGuard)
export class DevicesController {
  constructor(
    @Inject(DevicesService)
    private readonly service: DevicesService,
  ) {}

  @Post()
  @RequirePermission("device", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceWithRelations> {
    const parsed = deviceCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device payload",
        code: "INVALID_DEVICE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("device", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<DeviceListResult> {
    const parsed = deviceListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device list query",
        code: "INVALID_DEVICE_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("device", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<DeviceWithRelations> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("device", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceWithRelations> {
    const parsed = deviceUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device update",
        code: "INVALID_DEVICE_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("device", "delete")
  async remove(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<DeviceWithRelations> {
    return this.service.remove(companyId, id);
  }
}
