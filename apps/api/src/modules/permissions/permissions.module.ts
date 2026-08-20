import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService, CompanyRoleGuard],
})
export class PermissionsModule {}
