import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { QuotationsController } from "./quotations.controller";
import { QuotationsService } from "./quotations.service";

@Module({
  controllers: [QuotationsController],
  providers: [QuotationsService, CompanyRoleGuard],
  exports: [QuotationsService],
})
export class QuotationsModule {}
