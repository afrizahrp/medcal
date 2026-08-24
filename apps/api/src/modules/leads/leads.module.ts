import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CustomersModule } from "../customers/customers.module";
import { EmailsModule } from "../emails/emails.module";
import { PushTokensModule } from "../push-tokens/push-tokens.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [EmailsModule, PushTokensModule, CustomersModule],
  controllers: [LeadsController],
  providers: [LeadsService, CompanyRoleGuard],
})
export class LeadsModule {}
