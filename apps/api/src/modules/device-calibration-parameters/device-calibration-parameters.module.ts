import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceCalibrationParametersController } from "./device-calibration-parameters.controller";
import { DeviceCalibrationParametersService } from "./device-calibration-parameters.service";

@Module({
  controllers: [DeviceCalibrationParametersController],
  providers: [DeviceCalibrationParametersService, CompanyRoleGuard],
  exports: [DeviceCalibrationParametersService],
})
export class DeviceCalibrationParametersModule {}
