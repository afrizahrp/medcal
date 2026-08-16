import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, CompanyRoleGuard],
})
export class LeadsModule {}
