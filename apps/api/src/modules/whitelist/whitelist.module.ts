import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { RegistrationGateHook } from "./registration-gate.hook";
import { RegistrationOriginHook } from "./registration-origin.hook";
import { WhitelistController } from "./whitelist.controller";
import { WhitelistService } from "./whitelist.service";

@Module({
  controllers: [WhitelistController],
  providers: [WhitelistService, CompanyRoleGuard, RegistrationGateHook, RegistrationOriginHook],
})
export class WhitelistModule {}
