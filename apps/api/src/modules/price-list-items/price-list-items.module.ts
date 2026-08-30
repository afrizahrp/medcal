import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { PriceListItemsController } from "./price-list-items.controller";
import { PriceListItemsService } from "./price-list-items.service";

@Module({
  controllers: [PriceListItemsController],
  providers: [PriceListItemsService, CompanyRoleGuard],
  exports: [PriceListItemsService],
})
export class PriceListItemsModule {}
