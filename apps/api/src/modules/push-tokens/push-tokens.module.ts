import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { NotificationsTestController } from "./notifications-test.controller";
import { PushTokensController } from "./push-tokens.controller";
import { PushTokensService } from "./push-tokens.service";

@Module({
  controllers: [PushTokensController, NotificationsTestController],
  providers: [PushTokensService, CompanyRoleGuard],
  exports: [PushTokensService],
})
export class PushTokensModule {}
