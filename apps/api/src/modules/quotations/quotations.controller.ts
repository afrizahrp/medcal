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
  quotationCreateSchema,
  quotationListQuerySchema,
  quotationPreviewSchema,
  quotationUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  QuotationsService,
  type QuotationListResult,
  type QuotationPreviewResult,
  type QuotationWithItems,
} from "./quotations.service";

@Controller("quotations")
@UseGuards(CompanyRoleGuard)
export class QuotationsController {
  constructor(
    @Inject(QuotationsService)
    private readonly service: QuotationsService,
  ) {}

  @Post()
  @RequirePermission("quotation", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<QuotationWithItems> {
    const parsed = quotationCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid quotation payload",
        code: "INVALID_QUOTATION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Post("preview")
  @RequirePermission("quotation", "create")
  async preview(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<QuotationPreviewResult> {
    const parsed = quotationPreviewSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid quotation preview payload",
        code: "INVALID_QUOTATION_PREVIEW",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.preview(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("quotation", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<QuotationListResult> {
    const parsed = quotationListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid quotation list query",
        code: "INVALID_QUOTATION_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id/pdf")
  @RequirePermission("quotation", "read")
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
  @RequirePermission("quotation", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<QuotationWithItems> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("quotation", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<QuotationWithItems> {
    const parsed = quotationUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid quotation update",
        code: "INVALID_QUOTATION_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }

  @Post(":id/send")
  @RequirePermission("quotation", "update")
  async send(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<QuotationWithItems> {
    return this.service.send(companyId, id);
  }

  @Post(":id/approve")
  @RequirePermission("quotation", "approve")
  async approve(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
  ): Promise<QuotationWithItems> {
    return this.service.approve(companyId, id, userId);
  }

  @Post(":id/reject")
  @RequirePermission("quotation", "update")
  async reject(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<QuotationWithItems> {
    return this.service.reject(companyId, id);
  }

  @Post(":id/cancel")
  @RequirePermission("quotation", "cancel")
  async cancel(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<QuotationWithItems> {
    return this.service.cancel(companyId, id);
  }
}
