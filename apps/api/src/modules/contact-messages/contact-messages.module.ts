import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { InternalServiceGuard } from "../../common/guards/internal-service.guard";
import { PushTokensModule } from "../push-tokens/push-tokens.module";
import { ContactMessagesController } from "./contact-messages.controller";
import { ContactMessagesQueryController } from "./contact-messages-query.controller";
import { ContactTopicsController } from "./contact-topics.controller";
import { ContactMessagesService } from "./contact-messages.service";

@Module({
  imports: [PushTokensModule],
  controllers: [ContactMessagesController, ContactMessagesQueryController, ContactTopicsController],
  providers: [ContactMessagesService, InternalServiceGuard, CompanyRoleGuard],
  // Exported so ChatModule's ChatSessionsService can reuse the existing
  // ContactMessage -> Lead pipeline unmodified (Web Chat Phase 1).
  exports: [ContactMessagesService],
})
export class ContactMessagesModule {}
