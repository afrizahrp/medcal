import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceCapabilitiesController } from "./device-capabilities.controller";
import { DeviceCapabilitiesService } from "./device-capabilities.service";

@Module({
  controllers: [DeviceCapabilitiesController],
  providers: [DeviceCapabilitiesService, CompanyRoleGuard],
  exports: [DeviceCapabilitiesService],
})
export class DeviceCapabilitiesModule {}
