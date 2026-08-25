import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { UomsController } from "./uoms.controller";
import { UomsService } from "./uoms.service";

@Module({
  controllers: [UomsController],
  providers: [UomsService, CompanyRoleGuard],
  exports: [UomsService],
})
export class UomsModule {}
