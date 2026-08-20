import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { EmailsModule } from "../emails/emails.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [EmailsModule],
  controllers: [LeadsController],
  providers: [LeadsService, CompanyRoleGuard],
})
export class LeadsModule {}
