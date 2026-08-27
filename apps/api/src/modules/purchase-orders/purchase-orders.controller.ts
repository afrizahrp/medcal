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
  purchaseOrderCreateSchema,
  purchaseOrderListQuerySchema,
  purchaseOrderUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  PurchaseOrdersService,
  type PurchaseOrderListResult,
  type PurchaseOrderWithItems,
} from "./purchase-orders.service";

@Controller("purchase-orders")
@UseGuards(CompanyRoleGuard)
export class PurchaseOrdersController {
  constructor(
    @Inject(PurchaseOrdersService)
    private readonly service: PurchaseOrdersService,
  ) {}

  @Post()
  @RequirePermission("purchaseOrder", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<PurchaseOrderWithItems> {
    const parsed = purchaseOrderCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid purchase order payload",
        code: "INVALID_PURCHASE_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("purchaseOrder", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<PurchaseOrderListResult> {
    const parsed = purchaseOrderListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid purchase order list query",
        code: "INVALID_PURCHASE_ORDER_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id/pdf")
  @RequirePermission("purchaseOrder", "read")
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
  @RequirePermission("purchaseOrder", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<PurchaseOrderWithItems> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("purchaseOrder", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<PurchaseOrderWithItems> {
    const parsed = purchaseOrderUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid purchase order update",
        code: "INVALID_PURCHASE_ORDER_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }

  @Post(":id/approve")
  @RequirePermission("purchaseOrder", "approve")
  async approve(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
  ): Promise<PurchaseOrderWithItems> {
    return this.service.approve(companyId, id, userId);
  }

  @Post(":id/cancel")
  @RequirePermission("purchaseOrder", "cancel")
  async cancel(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<PurchaseOrderWithItems> {
    return this.service.cancel(companyId, id);
  }
}
