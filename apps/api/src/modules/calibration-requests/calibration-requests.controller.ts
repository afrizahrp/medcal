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
  UseGuards,
} from "@nestjs/common";
import {
  calibrationRequestCreateSchema,
  calibrationRequestListQuerySchema,
  calibrationRequestUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  CalibrationRequestsService,
  type CalibrationRequestListResult,
  type CalibrationRequestWithItems,
} from "./calibration-requests.service";

@Controller("calibration-requests")
@UseGuards(CompanyRoleGuard)
export class CalibrationRequestsController {
  constructor(
    @Inject(CalibrationRequestsService)
    private readonly service: CalibrationRequestsService,
  ) {}

  @Post()
  @RequirePermission("calibrationRequest", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationRequestWithItems> {
    const parsed = calibrationRequestCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration request payload",
        code: "INVALID_CALIBRATION_REQUEST",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("calibrationRequest", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<CalibrationRequestListResult> {
    const parsed = calibrationRequestListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration request list query",
        code: "INVALID_CALIBRATION_REQUEST_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("calibrationRequest", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationRequestWithItems> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("calibrationRequest", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationRequestWithItems> {
    const parsed = calibrationRequestUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration request update",
        code: "INVALID_CALIBRATION_REQUEST_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }

  @Post(":id/cancel")
  @RequirePermission("calibrationRequest", "cancel")
  async cancel(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationRequestWithItems> {
    return this.service.cancel(companyId, id);
  }

  @Post(":id/submit")
  @RequirePermission("calibrationRequest", "update")
  async submit(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationRequestWithItems> {
    return this.service.submit(companyId, id);
  }
}
