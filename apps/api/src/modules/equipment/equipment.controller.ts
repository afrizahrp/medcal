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
  equipmentCreateSchema,
  equipmentListQuerySchema,
  equipmentUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  EquipmentService,
  type EquipmentListResult,
  type EquipmentWithRelations,
} from "./equipment.service";

@Controller("equipment")
@UseGuards(CompanyRoleGuard)
export class EquipmentController {
  constructor(
    @Inject(EquipmentService)
    private readonly service: EquipmentService,
  ) {}

  @Post()
  @RequirePermission("equipment", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<EquipmentWithRelations> {
    const parsed = equipmentCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment payload",
        code: "INVALID_EQUIPMENT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("equipment", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<EquipmentListResult> {
    const parsed = equipmentListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment list query",
        code: "INVALID_EQUIPMENT_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("equipment", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<EquipmentWithRelations> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("equipment", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<EquipmentWithRelations> {
    const parsed = equipmentUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment update",
        code: "INVALID_EQUIPMENT_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("equipment", "delete")
  async remove(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<EquipmentWithRelations> {
    return this.service.remove(companyId, id);
  }
}
