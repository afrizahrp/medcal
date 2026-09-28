import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { dashboardQuerySchema, type DashboardSummaryResponse } from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(CompanyRoleGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly service: DashboardService,
  ) {}

  @Get("management-summary")
  @RequirePermission("managementDashboard", "read")
  async managementSummary(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<DashboardSummaryResponse> {
    const parsed = dashboardQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid dashboard query",
        code: "INVALID_DASHBOARD_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.managementSummary(companyId, parsed.data);
  }
}
