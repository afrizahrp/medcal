import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { leadAssignSchema, leadConvertSchema, leadListQuerySchema, leadStatusUpdateSchema } from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { LeadsService, type LeadListResult, type LeadWithTimeline, type NeedsReviewItem } from "./leads.service";
import { EmailsService } from "../emails/emails.service";

@Controller("leads")
@UseGuards(CompanyRoleGuard)
export class LeadsController {
  constructor(
    @Inject(LeadsService)
    private readonly service: LeadsService,
    @Inject(EmailsService)
    private readonly emails: EmailsService,
  ) {}

  @Get()
  @RequirePermission("lead", "read")
  async list(@CompanyId() companyId: string, @Query() rawQuery: unknown): Promise<LeadListResult> {
    const parsed = leadListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid lead list query",
        code: "INVALID_LEAD_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  // Declared before ":id" so "needs-review" is never captured as a Lead id.
  @Get("needs-review")
  @RequirePermission("lead", "read")
  async needsReview(@CompanyId() companyId: string): Promise<NeedsReviewItem[]> {
    return this.service.findNeedsReview(companyId);
  }

  @Get(":id/emails")
  @RequirePermission("lead", "read")
  async listEmails(@CompanyId() companyId: string, @Param("id") id: string) {
    return this.emails.listForLead(companyId, id);
  }

  @Get(":id")
  @RequirePermission("lead", "read")
  async findOne(@CompanyId() companyId: string, @Param("id") id: string): Promise<LeadWithTimeline> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id/status")
  @RequirePermission("lead", "update")
  async updateStatus(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = leadStatusUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid lead status",
        code: "INVALID_LEAD_STATUS",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateStatus(companyId, id, parsed.data.status);
  }

  @Patch(":id/assign")
  @RequirePermission("lead", "assign")
  async assign(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = leadAssignSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid lead assignment",
        code: "INVALID_LEAD_ASSIGNMENT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.assignToUser(companyId, id, parsed.data.assignedToUserId);
  }

  @Post(":id/convert")
  @RequirePermission("customer", "create")
  async convertToCustomer(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = leadConvertSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid lead conversion payload",
        code: "INVALID_LEAD_CONVERT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.convertToCustomer(companyId, id, parsed.data);
  }
}
