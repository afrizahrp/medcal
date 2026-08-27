import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  workOrderAssignSchema,
  workOrderCreateSchema,
  workOrderListQuerySchema,
  workOrderUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  WorkOrdersService,
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

  @Post(":id/cancel")
  @RequirePermission("workOrder", "cancel")
  async cancel(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<WorkOrderWithItems> {
    return this.service.cancel(companyId, id);
  }
}
