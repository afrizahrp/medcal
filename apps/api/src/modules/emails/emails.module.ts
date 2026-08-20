import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import { ImapSyncService } from "./imap-sync.service";
import { LeadSuggestionService } from "./lead-suggestion.service";

@Module({
  controllers: [EmailsController],
  providers: [EmailsService, ImapSyncService, LeadSuggestionService, CompanyRoleGuard],
  exports: [EmailsService],
})
export class EmailsModule {}
