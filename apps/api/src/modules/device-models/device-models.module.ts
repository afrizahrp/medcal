import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceModelsController } from "./device-models.controller";
import { DeviceModelsService } from "./device-models.service";

@Module({
  controllers: [DeviceModelsController],
  providers: [DeviceModelsService, CompanyRoleGuard],
  exports: [DeviceModelsService],
})
export class DeviceModelsModule {}
