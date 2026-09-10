import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DevicePhysicalCheckItemsController } from "./device-physical-check-items.controller";
import { DevicePhysicalCheckItemsService } from "./device-physical-check-items.service";

@Module({
  controllers: [DevicePhysicalCheckItemsController],
  providers: [DevicePhysicalCheckItemsService, CompanyRoleGuard],
  exports: [DevicePhysicalCheckItemsService],
})
export class DevicePhysicalCheckItemsModule {}
