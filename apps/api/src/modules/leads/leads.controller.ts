import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { leadListQuerySchema, leadStatusUpdateSchema } from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { LeadsService, type LeadListResult, type LeadWithTimeline, type NeedsReviewItem } from "./leads.service";

@Controller("leads")
@UseGuards(CompanyRoleGuard)
export class LeadsController {
  constructor(
    @Inject(LeadsService)
    private readonly service: LeadsService,
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
}
