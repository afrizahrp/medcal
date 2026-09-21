import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceManufacturersController } from "./device-manufacturers.controller";
import { DeviceManufacturersService } from "./device-manufacturers.service";

@Module({
  controllers: [DeviceManufacturersController],
  providers: [DeviceManufacturersService, CompanyRoleGuard],
  exports: [DeviceManufacturersService],
})
export class DeviceManufacturersModule {}
