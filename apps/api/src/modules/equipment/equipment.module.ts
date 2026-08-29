import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceTypeEquipmentRequirementsController } from "./device-type-equipment-requirements.controller";
import { DeviceTypeEquipmentRequirementsService } from "./device-type-equipment-requirements.service";
import { EquipmentController } from "./equipment.controller";
import { EquipmentService } from "./equipment.service";
import { EquipmentTypesController } from "./equipment-types.controller";
import { EquipmentTypesService } from "./equipment-types.service";

@Module({
  controllers: [
    EquipmentTypesController,
    DeviceTypeEquipmentRequirementsController,
    EquipmentController,
  ],
  providers: [
    EquipmentTypesService,
    DeviceTypeEquipmentRequirementsService,
    EquipmentService,
    CompanyRoleGuard,
  ],
  exports: [EquipmentTypesService, DeviceTypeEquipmentRequirementsService, EquipmentService],
})
export class EquipmentModule {}
