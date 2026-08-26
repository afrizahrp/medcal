import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, CompanyRoleGuard],
  exports: [DevicesService],
})
export class DevicesModule {}
