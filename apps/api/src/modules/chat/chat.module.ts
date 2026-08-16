import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { InternalServiceGuard } from "../../common/guards/internal-service.guard";
import { ContactMessagesModule } from "../contact-messages/contact-messages.module";
import { ChatGateway } from "./chat.gateway";
import { ChatSessionsAdminController } from "./chat-sessions-admin.controller";
import { ChatSessionsController } from "./chat-sessions.controller";
import { ChatSessionsService } from "./chat-sessions.service";

@Module({
  imports: [ContactMessagesModule],
  controllers: [ChatSessionsController, ChatSessionsAdminController],
  providers: [ChatSessionsService, InternalServiceGuard, CompanyRoleGuard, ChatGateway],
  exports: [ChatSessionsService],
})
export class ChatModule {}
