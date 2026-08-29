import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { FilesModule } from "../files/files.module";
import { FileOwnerPolicyRegistry } from "../files/owner-policy";
import {
  EquipmentCalibrationRecordsController,
  EquipmentCalibrationRecordsNestedController,
} from "./equipment-calibration-records.controller";
import { EquipmentCalibrationRecordsService } from "./equipment-calibration-records.service";
import { equipmentCalibrationFileOwnerPolicy } from "./equipment-calibration-file-owner-policy";

/**
 * Phase 2B. Owns EquipmentCalibrationRecord CRUD and registers the
 * EQUIPMENT_CALIBRATION FileOwnerPolicy with the generic FilesModule so
 * certificate PDFs attach to a record (ownerId = record id) with authorization
 * resolved through the `equipmentCalibrationRecord` permission and immutability
 * gated on the record's CONFIRMED status.
 */
@Module({
  imports: [FilesModule],
  controllers: [
    EquipmentCalibrationRecordsNestedController,
    EquipmentCalibrationRecordsController,
  ],
  providers: [EquipmentCalibrationRecordsService, CompanyRoleGuard],
  exports: [EquipmentCalibrationRecordsService],
})
export class EquipmentCalibrationRecordsModule implements OnModuleInit {
  constructor(
    @Inject(FileOwnerPolicyRegistry)
    private readonly fileOwnerPolicies: FileOwnerPolicyRegistry,
  ) {}

  onModuleInit(): void {
    this.fileOwnerPolicies.register(equipmentCalibrationFileOwnerPolicy);
  }
}
