import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { PushTokensController } from "./push-tokens.controller";
import { PushTokensService } from "./push-tokens.service";

@Module({
  controllers: [PushTokensController],
  providers: [PushTokensService, CompanyRoleGuard],
  exports: [PushTokensService],
})
export class PushTokensModule {}
