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
  deviceTypeEquipmentRequirementCreateSchema,
  deviceTypeEquipmentRequirementGroupedQuerySchema,
  deviceTypeEquipmentRequirementReorderSchema,
  deviceTypeEquipmentRequirementUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceTypeEquipmentRequirementsService,
  type DeviceTypeEquipmentRequirementGroupedResult,
  type DeviceTypeEquipmentRequirementWithRelations,
} from "./device-type-equipment-requirements.service";

@Controller("device-type-equipment-requirements")
@UseGuards(CompanyRoleGuard)
export class DeviceTypeEquipmentRequirementsController {
  constructor(
    @Inject(DeviceTypeEquipmentRequirementsService)
    private readonly service: DeviceTypeEquipmentRequirementsService,
  ) {}

  @Get("grouped")
  @RequirePermission("equipmentRequirement", "read")
  async listGrouped(
    @Query() rawQuery: unknown,
  ): Promise<DeviceTypeEquipmentRequirementGroupedResult> {
    const parsed = deviceTypeEquipmentRequirementGroupedQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment requirement grouped query",
        code: "INVALID_EQUIPMENT_REQUIREMENT_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAllGroupedByDeviceType(parsed.data);
  }

  @Get()
  @RequirePermission("equipmentRequirement", "read")
  async list(
    @Query("deviceTypeId") deviceTypeId?: string,
    @Query("equipmentTypeId") equipmentTypeId?: string,
  ): Promise<DeviceTypeEquipmentRequirementWithRelations[]> {
    return this.service.findAll({
      deviceTypeId: deviceTypeId || undefined,
      equipmentTypeId: equipmentTypeId || undefined,
    });
  }

  @Post()
  @RequirePermission("equipmentRequirement", "create")
  async create(@Body() rawBody: unknown): Promise<DeviceTypeEquipmentRequirementWithRelations> {
    const parsed = deviceTypeEquipmentRequirementCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment requirement payload",
        code: "INVALID_EQUIPMENT_REQUIREMENT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Patch("device-types/:deviceTypeId/requirement-order")
  @RequirePermission("equipmentRequirement", "update")
  async reorder(
    @Param("deviceTypeId") deviceTypeId: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceTypeEquipmentRequirementWithRelations[]> {
    const parsed = deviceTypeEquipmentRequirementReorderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment requirement order payload",
        code: "INVALID_EQUIPMENT_REQUIREMENT_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reorder(deviceTypeId, parsed.data.requirementIds);
  }

  @Patch(":id")
  @RequirePermission("equipmentRequirement", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceTypeEquipmentRequirementWithRelations> {
    const parsed = deviceTypeEquipmentRequirementUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment requirement update",
        code: "INVALID_EQUIPMENT_REQUIREMENT_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("equipmentRequirement", "delete")
  async remove(@Param("id") id: string): Promise<DeviceTypeEquipmentRequirementWithRelations> {
    return this.service.remove(id);
  }
}
