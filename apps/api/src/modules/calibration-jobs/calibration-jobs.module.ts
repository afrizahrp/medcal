import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import { CalibrationJobsService } from "./calibration-jobs.service";

@Module({
  controllers: [CalibrationJobsController],
  providers: [CalibrationJobsService, CompanyRoleGuard],
  exports: [CalibrationJobsService],
})
export class CalibrationJobsModule {}
