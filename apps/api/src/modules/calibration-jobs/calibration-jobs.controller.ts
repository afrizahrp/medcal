import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  calibrationJobAssignDeviceSchema,
  calibrationJobEscalateIdentitySchema,
  calibrationJobIdentityDecisionSchema,
  calibrationJobListQuerySchema,
  calibrationJobRegisterDeviceSchema,
} from "@medcal/shared";
import type { DeviceWithRelations } from "../devices/devices.service";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  CalibrationJobsService,
  type CalibrationJobDetail,
  type CalibrationJobDeviceAssignmentResult,
  type CalibrationJobListResult,
} from "./calibration-jobs.service";

@Controller("calibration-jobs")
@UseGuards(CompanyRoleGuard)
export class CalibrationJobsController {
  constructor(
    @Inject(CalibrationJobsService)
    private readonly service: CalibrationJobsService,
  ) {}

  @Get()
  @RequirePermission("calibrationJob", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<CalibrationJobListResult> {
    const parsed = calibrationJobListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration job list query",
        code: "INVALID_CALIBRATION_JOB_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("calibrationJob", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationJobDetail> {
    return this.service.findOne(companyId, id);
  }

  @Post(":id/escalate-identity")
  @RequirePermission("calibrationJob", "escalateIdentity")
  async escalateIdentity(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationJobDetail> {
    const parsed = calibrationJobEscalateIdentitySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid identity escalation payload",
        code: "INVALID_CALIBRATION_JOB_IDENTITY_ESCALATION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.escalateIdentity(companyId, id, parsed.data);
  }

  @Post(":id/identity-decision")
  @RequirePermission("calibrationJob", "approveIdentity")
  async decideIdentity(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationJobDetail> {
    const parsed = calibrationJobIdentityDecisionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid identity decision payload",
        code: "INVALID_CALIBRATION_JOB_IDENTITY_DECISION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.decideIdentity(companyId, id, userId, parsed.data);
  }

  @Get(":id/device-candidates")
  @RequirePermission("calibrationJob", "assignDevice")
  async deviceCandidates(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Query("search") search?: string,
  ): Promise<DeviceWithRelations[]> {
    const trimmed = typeof search === "string" ? search.trim() : "";
    return this.service.findDeviceCandidates(companyId, id, trimmed || undefined);
  }

  @Post(":id/assign-device")
  @RequirePermission("calibrationJob", "assignDevice")
  async assignDevice(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationJobDeviceAssignmentResult> {
    const parsed = calibrationJobAssignDeviceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device assignment payload",
        code: "INVALID_CALIBRATION_JOB_ASSIGN_DEVICE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.assignDevice(companyId, id, parsed.data);
  }

  @Post(":id/register-device")
  @RequirePermission("calibrationJob", "assignDevice")
  async registerDevice(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationJobDeviceAssignmentResult> {
    const parsed = calibrationJobRegisterDeviceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device registration payload",
        code: "INVALID_CALIBRATION_JOB_REGISTER_DEVICE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.registerDevice(companyId, id, parsed.data);
  }
}
