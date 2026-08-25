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
  deviceCategoryCreateSchema,
  deviceCategoryListQuerySchema,
  deviceCategoryUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceCategoriesService,
  type DeviceCategoryListResult,
} from "./device-categories.service";
import type { DeviceCategory } from "@medcal/db";

@Controller("device-categories")
@UseGuards(CompanyRoleGuard)
export class DeviceCategoriesController {
  constructor(
    @Inject(DeviceCategoriesService)
    private readonly service: DeviceCategoriesService,
  ) {}

  @Post()
  @RequirePermission("deviceCategory", "create")
  async create(@Body() rawBody: unknown): Promise<DeviceCategory> {
    const parsed = deviceCategoryCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device category payload",
        code: "INVALID_DEVICE_CATEGORY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("deviceCategory", "read")
  async list(@Query() rawQuery: unknown): Promise<DeviceCategoryListResult> {
    const parsed = deviceCategoryListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device category list query",
        code: "INVALID_DEVICE_CATEGORY_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get(":id")
  @RequirePermission("deviceCategory", "read")
  async findOne(@Param("id") id: string): Promise<DeviceCategory> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("deviceCategory", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceCategory> {
    const parsed = deviceCategoryUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device category update",
        code: "INVALID_DEVICE_CATEGORY_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("deviceCategory", "delete")
  async remove(@Param("id") id: string): Promise<DeviceCategory> {
    return this.service.remove(id);
  }
}
