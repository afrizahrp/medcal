import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceTypeEquipmentRequirementsController } from "./device-type-equipment-requirements.controller";
import { DeviceTypeEquipmentRequirementsService } from "./device-type-equipment-requirements.service";
import { EquipmentTypesController } from "./equipment-types.controller";
import { EquipmentTypesService } from "./equipment-types.service";

@Module({
  controllers: [EquipmentTypesController, DeviceTypeEquipmentRequirementsController],
  providers: [
    EquipmentTypesService,
    DeviceTypeEquipmentRequirementsService,
    CompanyRoleGuard,
  ],
  exports: [EquipmentTypesService, DeviceTypeEquipmentRequirementsService],
})
export class EquipmentModule {}
