import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { MembershipRole } from "@medcal/db";
import {
  calibrationJobEscalateIdentitySchema,
  calibrationJobIdentityDecisionSchema,
  calibrationJobListQuerySchema,
  identityCorrectionDecisionSchema,
  identityCorrectionSubmitSchema,
  jobReferenceEquipmentReplaceSchema,
} from "@medcal/shared";
import type { DeviceWithRelations } from "../devices/devices.service";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { MembershipRoleParam } from "../../common/decorators/membership-role.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  CalibrationJobsService,
  type CalibrationJobDetail,
  type CalibrationJobGroupedResult,
  type CalibrationJobListResult,
  type CalibrationJobListRow,
  type IdentityCorrectionDetail,
  type IdentityCorrectionSubmitResult,
} from "./calibration-jobs.service";
import type {
  JobReferenceEquipmentCandidate,
  JobReferenceEquipmentUsedDetail,
} from "./job-reference-equipment";

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
    @UserId() userId: string,
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
    return this.service.findAll(companyId, parsed.data, userId);
  }

  /**
   * SPK (WorkOrder)-grouped list for the Portal Calibration Jobs page. Same
   * query params as the flat list; pagination is at the WorkOrder level.
   * Declared before `:id` so "grouped" is not captured as an id.
   */
  @Get("grouped")
  @RequirePermission("calibrationJob", "read")
  async listGrouped(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Query() rawQuery: unknown,
  ): Promise<CalibrationJobGroupedResult> {
    const parsed = calibrationJobListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration job list query",
        code: "INVALID_CALIBRATION_JOB_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAllGroupedByWorkOrder(companyId, parsed.data, userId);
  }

  @Get(":id")
  @RequirePermission("calibrationJob", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationJobListRow> {
    return this.service.findOneRow(companyId, id);
  }

  @Post(":id/start")
  @RequirePermission("calibrationJob", "start")
  async start(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationJobDetail> {
    return this.service.start(companyId, id);
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
  @RequirePermission("calibrationJob", "submitIdentityCorrection")
  async deviceCandidates(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Query("search") search?: string,
  ): Promise<DeviceWithRelations[]> {
    const trimmed = typeof search === "string" ? search.trim() : "";
    return this.service.findDeviceCandidates(companyId, id, trimmed || undefined);
  }

  /**
   * Removed. Every device-identity binding now flows through the Identity
   * Correction BA workflow below. This route stays only to return a typed 410
   * until the Portal UI is migrated.
   */
  @Post(":id/assign-device")
  @RequirePermission("calibrationJob", "submitIdentityCorrection")
  async assignDevice(): Promise<never> {
    return this.service.assignDeviceRemoved();
  }

  @Get(":id/identity-corrections")
  @RequirePermission("calibrationJob", "read")
  async listIdentityCorrections(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<IdentityCorrectionDetail[]> {
    return this.service.listIdentityCorrections(companyId, id);
  }

  @Get(":id/identity-corrections/:correctionId")
  @RequirePermission("calibrationJob", "read")
  async getIdentityCorrection(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Param("correctionId") correctionId: string,
  ): Promise<IdentityCorrectionDetail> {
    return this.service.getIdentityCorrection(companyId, id, correctionId);
  }

  @Get(":id/identity-corrections/:correctionId/pdf")
  @RequirePermission("calibrationJob", "read")
  async downloadIdentityCorrectionPdf(
    @CompanyId() companyId: string,
    @MembershipRoleParam() role: MembershipRole,
    @Param("id") id: string,
    @Param("correctionId") correctionId: string,
  ): Promise<StreamableFile> {
    const pdf = await this.service.buildIdentityCorrectionPdf(companyId, id, correctionId, role);
    return new StreamableFile(pdf.buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${pdf.filename}"`,
    });
  }

  @Post(":id/identity-corrections")
  @RequirePermission("calibrationJob", "submitIdentityCorrection")
  async submitIdentityCorrection(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<IdentityCorrectionSubmitResult> {
    const parsed = identityCorrectionSubmitSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid identity correction payload",
        code: "INVALID_IDENTITY_CORRECTION_SUBMIT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.submitIdentityCorrection(companyId, id, userId, parsed.data);
  }

  @Post(":id/identity-corrections/:correctionId/decision")
  @RequirePermission("calibrationJob", "decideIdentityCorrection")
  async decideIdentityCorrection(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Param("correctionId") correctionId: string,
    @Body() rawBody: unknown,
  ): Promise<{ job: CalibrationJobDetail; correction: IdentityCorrectionDetail }> {
    const parsed = identityCorrectionDecisionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid identity correction decision payload",
        code: "INVALID_IDENTITY_CORRECTION_DECISION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.decideIdentityCorrection(companyId, id, correctionId, userId, parsed.data);
  }

  @Get(":id/reference-equipment-candidates")
  @RequirePermission("calibrationJob", "read")
  async referenceEquipmentCandidates(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<JobReferenceEquipmentCandidate[]> {
    return this.service.getReferenceEquipmentCandidates(companyId, id);
  }

  @Get(":id/reference-equipment-used")
  @RequirePermission("calibrationJob", "read")
  async listReferenceEquipmentUsed(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<JobReferenceEquipmentUsedDetail[]> {
    return this.service.listReferenceEquipmentUsed(companyId, id);
  }

  @Put(":id/reference-equipment-used")
  @RequirePermission("calibrationJob", "recordReferenceEquipmentUsed")
  async replaceReferenceEquipmentUsed(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @MembershipRoleParam() role: MembershipRole,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<JobReferenceEquipmentUsedDetail[]> {
    const parsed = jobReferenceEquipmentReplaceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid reference equipment selection",
        code: "INVALID_JOB_REFERENCE_EQUIPMENT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.replaceReferenceEquipmentUsed(companyId, id, userId, role, parsed.data);
  }
}
