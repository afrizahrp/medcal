import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  workOrderAssignSchema,
  workOrderCreateSchema,
  workOrderEquipmentOrderSchema,
  workOrderEquipmentProposalQuerySchema,
  workOrderEquipmentReplaceSchema,
  workOrderListQuerySchema,
  workOrderRequestReviewSchema,
  workOrderUpdateSchema,
  workOrderItemAccessoriesReplaceSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  WorkOrdersService,
  type WorkOrderHistorySummary,
  type WorkOrderHistoryWithItems,
  type WorkOrderListResult,
  type WorkOrderWithItems,
} from "./work-orders.service";

@Controller("work-orders")
@UseGuards(CompanyRoleGuard)
export class WorkOrdersController {
  constructor(
    @Inject(WorkOrdersService)
    private readonly service: WorkOrdersService,
  ) {}

  @Post()
  @RequirePermission("workOrder", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<WorkOrderWithItems> {
    const parsed = workOrderCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid work order payload",
        code: "INVALID_WORK_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("workOrder", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<WorkOrderListResult> {
    const parsed = workOrderListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid work order list query",
        code: "INVALID_WORK_ORDER_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get("equipment-proposal")
  @RequirePermission("workOrder", "read")
  async equipmentProposalForPurchaseOrder(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ) {
    const parsed = workOrderEquipmentProposalQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment proposal query",
        code: "INVALID_WORK_ORDER_EQUIPMENT_PROPOSAL_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.getEquipmentProposalForPurchaseOrder(
      companyId,
      parsed.data.purchaseOrderId,
    );
  }

  @Get(":id/equipment-proposal")
  @RequirePermission("workOrder", "read")
  async equipmentProposal(@CompanyId() companyId: string, @Param("id") id: string) {
    return this.service.getEquipmentProposal(companyId, id);
  }

  @Put(":id/equipment")
  @RequirePermission("workOrder", "update")
  async replaceEquipment(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = workOrderEquipmentReplaceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment selection",
        code: "INVALID_WORK_ORDER_EQUIPMENT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.replaceEquipment(companyId, id, parsed.data);
  }

  @Post(":id/equipment/confirm")
  @RequirePermission("workOrder", "update")
  async confirmEquipment(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderWithItems> {
    return this.service.confirmEquipment(companyId, id);
  }

  @Patch(":id/request-review")
  @RequirePermission("workOrder", "update")
  async updateRequestReview(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<WorkOrderWithItems> {
    const parsed = workOrderRequestReviewSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid request review payload",
        code: "INVALID_WORK_ORDER_REQUEST_REVIEW",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateRequestReview(companyId, id, userId, parsed.data);
  }

  @Put(":id/items/:itemId/accessories")
  @RequirePermission("workOrder", "update")
  async replaceItemAccessories(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() rawBody: unknown,
  ): Promise<WorkOrderWithItems> {
    const parsed = workOrderItemAccessoriesReplaceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid work order item accessories",
        code: "INVALID_WORK_ORDER_ITEM_ACCESSORIES",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.replaceItemAccessories(companyId, id, itemId, parsed.data);
  }

  @Patch(":id/equipment/order")
  @RequirePermission("workOrder", "update")
  async reorderEquipment(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<WorkOrderWithItems> {
    const parsed = workOrderEquipmentOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid equipment order",
        code: "INVALID_WORK_ORDER_EQUIPMENT_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reorderEquipment(companyId, id, parsed.data.equipmentIds);
  }

  @Get(":id/pdf")
  @RequirePermission("workOrder", "read")
  async downloadPdf(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const pdf = await this.service.buildPdf(companyId, id);
    return new StreamableFile(pdf.buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${pdf.filename}"`,
    });
  }

  @Get(":id")
  @RequirePermission("workOrder", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderWithItems> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("workOrder", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<WorkOrderWithItems> {
    const parsed = workOrderUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid work order update",
        code: "INVALID_WORK_ORDER_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }

  @Post(":id/assign")
  @RequirePermission("workOrder", "assign")
  async assign(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<WorkOrderWithItems> {
    const parsed = workOrderAssignSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid work order assignment",
        code: "INVALID_WORK_ORDER_ASSIGN",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.assign(companyId, id, parsed.data);
  }

  @Post(":id/start")
  @RequirePermission("workOrder", "update")
  async start(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderWithItems> {
    return this.service.start(companyId, id);
  }

  @Post(":id/done")
  @RequirePermission("workOrder", "update")
  async done(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderWithItems> {
    return this.service.done(companyId, id);
  }

  /** MOM #1 — Revise a PLANNED/ASSIGNED work order (pull-based, no body). */
  @Post(":id/revise")
  @RequirePermission("workOrder", "update")
  async revise(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderWithItems> {
    return this.service.revise(companyId, id, userId);
  }

  /** MOM #1 — read-only revision list (header snapshots only). */
  @Get(":id/history")
  @RequirePermission("workOrder", "read")
  async listHistory(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderHistorySummary[]> {
    return this.service.listHistory(companyId, id);
  }

  /** MOM #1 — read-only single revision snapshot, including its items. */
  @Get(":id/history/:revisionNumber")
  @RequirePermission("workOrder", "read")
  async getHistoryRevision(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Param("revisionNumber") revisionNumber: string,
  ): Promise<WorkOrderHistoryWithItems> {
    const parsedRevisionNumber = Number(revisionNumber);
    if (!Number.isInteger(parsedRevisionNumber) || parsedRevisionNumber < 1) {
      throw new BadRequestException({
        message: "Invalid revision number",
        code: "INVALID_REVISION_NUMBER",
      });
    }
    return this.service.getHistoryRevision(companyId, id, parsedRevisionNumber);
  }

  @Post(":id/cancel")
  @RequirePermission("workOrder", "cancel")
  async cancel(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderWithItems> {
    return this.service.cancel(companyId, id);
  }
}
