import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeliveryNotesService,
  type EquipmentDeliveryNoteWithItems,
} from "./delivery-notes.service";

/**
 * "Surat Jalan Alat" for an ON_SITE work order. Equipment always comes from the
 * work order's confirmed WorkOrderEquipment — this controller never accepts an
 * equipment payload. RBAC reuses the `workOrder` resource: `read` to view /
 * download, `update` to issue.
 */
@Controller("work-orders/:workOrderId/delivery-note")
@UseGuards(CompanyRoleGuard)
export class DeliveryNotesController {
  constructor(
    @Inject(DeliveryNotesService)
    private readonly service: DeliveryNotesService,
  ) {}

  @Post()
  @RequirePermission("workOrder", "update")
  async issue(
    @CompanyId() companyId: string,
    @Param("workOrderId") workOrderId: string,
  ): Promise<EquipmentDeliveryNoteWithItems> {
    return this.service.issue(companyId, workOrderId);
  }

  @Get()
  @RequirePermission("workOrder", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("workOrderId") workOrderId: string,
  ): Promise<EquipmentDeliveryNoteWithItems> {
    return this.service.findOne(companyId, workOrderId);
  }

  @Get("pdf")
  @RequirePermission("workOrder", "read")
  async downloadPdf(
    @CompanyId() companyId: string,
    @Param("workOrderId") workOrderId: string,
  ): Promise<StreamableFile> {
    const pdf = await this.service.buildPdf(companyId, workOrderId);
    return new StreamableFile(pdf.buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${pdf.filename}"`,
    });
  }
}
