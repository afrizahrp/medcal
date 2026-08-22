import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationRecipientService } from "./notification-recipient.service";
import { NotificationsTestController } from "./notifications-test.controller";
import { PushTokensController } from "./push-tokens.controller";
import { PushTokensService } from "./push-tokens.service";

@Module({
  controllers: [PushTokensController, NotificationsTestController],
  providers: [
    PushTokensService,
    NotificationRecipientService,
    NotificationDispatchService,
    CompanyRoleGuard,
  ],
  exports: [PushTokensService, NotificationRecipientService, NotificationDispatchService],
})
export class PushTokensModule {}
