import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceTypesController } from "./device-types.controller";
import { DeviceTypesService } from "./device-types.service";

@Module({
  controllers: [DeviceTypesController],
  providers: [DeviceTypesService, CompanyRoleGuard],
  exports: [DeviceTypesService],
})
export class DeviceTypesModule {}
