import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { MenuController } from "./menu.controller";
import { MenuService } from "./menu.service";

@Module({
  controllers: [MenuController],
  providers: [MenuService, CompanyRoleGuard],
})
export class MenuModule {}
