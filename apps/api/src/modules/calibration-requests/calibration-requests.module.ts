import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CalibrationRequestImportService } from "./calibration-request-import.service";
import { CalibrationRequestsController } from "./calibration-requests.controller";
import { CalibrationRequestsService } from "./calibration-requests.service";

@Module({
  controllers: [CalibrationRequestsController],
  providers: [CalibrationRequestsService, CalibrationRequestImportService, CompanyRoleGuard],
  exports: [CalibrationRequestsService],
})
export class CalibrationRequestsModule {}
