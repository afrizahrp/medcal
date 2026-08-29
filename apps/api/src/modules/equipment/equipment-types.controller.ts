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
  equipmentTypeCreateSchema,
  equipmentTypeListQuerySchema,
  equipmentTypeUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { EquipmentTypesService, type EquipmentTypeListResult } from "./equipment-types.service";
import type { EquipmentType } from "@medcal/db";

@Controller("equipment-types")
@UseGuards(CompanyRoleGuard)
export class EquipmentTypesController {
  constructor(
    @Inject(EquipmentTypesService)
    private readonly service: EquipmentTypesService,
  ) {}

  @Post()
  @RequirePermission("equipmentType", "create")
  async create(@Body() rawBody: unknown): Promise<EquipmentType> {
    const parsed = equipmentTypeCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment type payload",
        code: "INVALID_EQUIPMENT_TYPE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("equipmentType", "read")
  async list(@Query() rawQuery: unknown): Promise<EquipmentTypeListResult> {
    const parsed = equipmentTypeListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment type list query",
        code: "INVALID_EQUIPMENT_TYPE_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Get(":id")
  @RequirePermission("equipmentType", "read")
  async findOne(@Param("id") id: string): Promise<EquipmentType> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("equipmentType", "update")
  async update(@Param("id") id: string, @Body() rawBody: unknown): Promise<EquipmentType> {
    const parsed = equipmentTypeUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment type update",
        code: "INVALID_EQUIPMENT_TYPE_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("equipmentType", "delete")
  async remove(@Param("id") id: string): Promise<EquipmentType> {
    return this.service.remove(id);
  }
}
