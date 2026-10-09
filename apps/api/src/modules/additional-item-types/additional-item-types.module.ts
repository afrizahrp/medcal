import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { AdditionalItemTypesController } from "./additional-item-types.controller";
import { AdditionalItemTypesService } from "./additional-item-types.service";

@Module({
  controllers: [AdditionalItemTypesController],
  providers: [AdditionalItemTypesService, CompanyRoleGuard],
  exports: [AdditionalItemTypesService],
})
export class AdditionalItemTypesModule {}
