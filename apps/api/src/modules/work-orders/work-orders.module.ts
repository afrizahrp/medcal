import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";

@Module({
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, CompanyRoleGuard],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
