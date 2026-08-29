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
  UseGuards,
} from "@nestjs/common";
import {
  equipmentCalibrationRecordCreateSchema,
  equipmentCalibrationRecordUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  EquipmentCalibrationRecordsService,
  type CalibrationRecordListResult,
  type CalibrationRecordWithDocuments,
} from "./equipment-calibration-records.service";

/** Nested under an Equipment unit: list + create. */
@Controller("equipment")
@UseGuards(CompanyRoleGuard)
export class EquipmentCalibrationRecordsNestedController {
  constructor(
    @Inject(EquipmentCalibrationRecordsService)
    private readonly service: EquipmentCalibrationRecordsService,
  ) {}

  @Get(":equipmentId/calibration-records")
  @RequirePermission("equipmentCalibrationRecord", "read")
  async list(
    @CompanyId() companyId: string,
    @Param("equipmentId") equipmentId: string,
  ): Promise<CalibrationRecordListResult> {
    return this.service.listForEquipment(companyId, equipmentId);
  }

  @Post(":equipmentId/calibration-records")
  @RequirePermission("equipmentCalibrationRecord", "create")
  async create(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("equipmentId") equipmentId: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationRecordWithDocuments> {
    const parsed = equipmentCalibrationRecordCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration record payload",
        code: "INVALID_EQUIPMENT_CALIBRATION_RECORD",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, userId, equipmentId, parsed.data);
  }
}

/** Item operations. */
@Controller("equipment-calibration-records")
@UseGuards(CompanyRoleGuard)
export class EquipmentCalibrationRecordsController {
  constructor(
    @Inject(EquipmentCalibrationRecordsService)
    private readonly service: EquipmentCalibrationRecordsService,
  ) {}

  @Get(":id")
  @RequirePermission("equipmentCalibrationRecord", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationRecordWithDocuments> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("equipmentCalibrationRecord", "update")
  async update(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationRecordWithDocuments> {
    const parsed = equipmentCalibrationRecordUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration record update",
        code: "INVALID_EQUIPMENT_CALIBRATION_RECORD_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, userId, id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("equipmentCalibrationRecord", "delete")
  async remove(@CompanyId() companyId: string, @Param("id") id: string) {
    return this.service.remove(companyId, id);
  }
}
