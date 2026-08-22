import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { EmailsModule } from "../emails/emails.module";
import { PushTokensModule } from "../push-tokens/push-tokens.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [EmailsModule, PushTokensModule],
  controllers: [LeadsController],
  providers: [LeadsService, CompanyRoleGuard],
})
export class LeadsModule {}
