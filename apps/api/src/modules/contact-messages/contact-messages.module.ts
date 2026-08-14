import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { InternalServiceGuard } from "../../common/guards/internal-service.guard";
import { ContactMessagesController } from "./contact-messages.controller";
import { ContactMessagesQueryController } from "./contact-messages-query.controller";
import { ContactMessagesService } from "./contact-messages.service";

@Module({
  controllers: [ContactMessagesController, ContactMessagesQueryController],
  providers: [ContactMessagesService, InternalServiceGuard, CompanyRoleGuard],
})
export class ContactMessagesModule {}
