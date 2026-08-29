import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceTypeAliasesController } from "./device-type-aliases.controller";
import { DeviceTypeAliasesService } from "./device-type-aliases.service";

@Module({
  controllers: [DeviceTypeAliasesController],
  providers: [DeviceTypeAliasesService, CompanyRoleGuard],
  exports: [DeviceTypeAliasesService],
})
export class DeviceTypeAliasesModule {}
