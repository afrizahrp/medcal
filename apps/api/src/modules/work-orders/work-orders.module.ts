import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DeliveryNotesController } from "./delivery-notes.controller";
import { DeliveryNotesService } from "./delivery-notes.service";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";

@Module({
  controllers: [WorkOrdersController, DeliveryNotesController],
  providers: [WorkOrdersService, DeliveryNotesService, CompanyRoleGuard],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
