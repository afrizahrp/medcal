import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";

@Module({
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, CompanyRoleGuard],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
