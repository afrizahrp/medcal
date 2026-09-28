import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, CompanyRoleGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
