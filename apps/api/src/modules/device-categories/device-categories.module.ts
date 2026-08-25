import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeviceCategoriesController } from "./device-categories.controller";
import { DeviceCategoriesService } from "./device-categories.service";

@Module({
  controllers: [DeviceCategoriesController],
  providers: [DeviceCategoriesService, CompanyRoleGuard],
  exports: [DeviceCategoriesService],
})
export class DeviceCategoriesModule {}
