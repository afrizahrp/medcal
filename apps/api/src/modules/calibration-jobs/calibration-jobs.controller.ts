import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { MembershipRole } from "@medcal/db";
import {
  calibrationJobDeviceCandidatesQuerySchema,
  calibrationJobEscalateIdentitySchema,
  calibrationJobIdentityDecisionSchema,
  calibrationJobListQuerySchema,
  calibrationJobSelectDeviceSchema,
  identityCorrectionDecisionSchema,
  identityCorrectionSubmitSchema,
  jobReferenceEquipmentApprovalDecisionSchema,
  jobReferenceEquipmentReplaceSchema,
  jobWorksheetRevisionSchema,
  lkDownloadReauthSchema,
  measurementResultBatchCreateSchema,
  measurementResultCreateSchema,
  measurementResultUpdateSchema,
  physicalCheckResultBatchCreateSchema,
  physicalCheckResultCreateSchema,
  physicalCheckResultUpdateSchema,
  qualityReviewDecisionSchema,
  kontrolAlatAccessoryCreateSchema,
  kontrolAlatAccessoryUpdateSchema,
  kontrolAlatPatchSchema,
  kontrolAlatSignatureCreateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { MembershipRoleParam } from "../../common/decorators/membership-role.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserEmail } from "../../common/decorators/user-email.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { LkDownloadService } from "./lk-download.service";
import {
  CalibrationJobsService,
  type CalibrationJobDetail,
  type CalibrationJobGroupedResult,
  type CalibrationJobListResult,
  type CalibrationJobListRow,
  type IdentityCorrectionDetail,
  type IdentityCorrectionSubmitResult,
  type JobMeasurementParametersResult,
  type JobWorksheetSnapshotResult,
} from "./calibration-jobs.service";
import type { DeviceListResult } from "../devices/devices.service";
import type {
  JobReferenceEquipmentApprovalDetail,
  JobReferenceEquipmentCandidate,
  JobReferenceEquipmentUsedDetail,
} from "./job-reference-equipment";
import {
  MeasurementResultsService,
  type MeasurementResultRow,
} from "./measurement-results.service";
import {
  PhysicalCheckResultsService,
  type DevicePhysicalCheckItemRow,
  type PhysicalCheckResultRow,
} from "./physical-check-results.service";
import {
  KontrolAlatService,
  type KontrolAlatDetail,
} from "./kontrol-alat.service";

@Controller("calibration-jobs")
@UseGuards(CompanyRoleGuard)
export class CalibrationJobsController {
  constructor(
    @Inject(CalibrationJobsService)
    private readonly service: CalibrationJobsService,
    @Inject(MeasurementResultsService)
    private readonly measurements: MeasurementResultsService,
    @Inject(PhysicalCheckResultsService)
    private readonly physicalChecks: PhysicalCheckResultsService,
    @Inject(KontrolAlatService)
    private readonly kontrolAlat: KontrolAlatService,
    @Inject(LkDownloadService)
    private readonly lkDownload: LkDownloadService,
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

  @Post(":id/submit")
  @RequirePermission("calibrationJob", "submitForReview")
  async submitForReview(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationJobDetail> {
    return this.service.submitForReview(companyId, id);
  }

  @Post(":id/quality-decision")
  @RequirePermission("calibrationJob", "decideQualityReview")
  async decideQualityReview(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationJobDetail> {
    const parsed = qualityReviewDecisionSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid quality review decision payload",
        code: "INVALID_QUALITY_REVIEW_DECISION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.decideQualityReview(companyId, id, userId, parsed.data);
  }

  @Post(":id/complete")
  @RequirePermission("calibrationJob", "complete")
  async complete(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationJobDetail> {
    return this.service.complete(companyId, id);
  }

  @Post(":id/resume")
  @RequirePermission("calibrationJob", "resumeAfterRework")
  async resumeAfterRework(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CalibrationJobDetail> {
    return this.service.resumeAfterRework(companyId, id);
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

  /**
   * Removed. The Device assigned by the WO/SPK is locked (MoM #6) — nothing
   * rebinds it. This route stays only to return a typed 410 to an
   * un-migrated Portal build.
   */
  @Post(":id/assign-device")
  @RequirePermission("calibrationJob", "submitIdentityCorrection")
  async assignDevice(): Promise<never> {
    return this.service.assignDeviceRemoved();
  }

  /**
   * Technician Device Lookup (2026-09-21). Deliberately a different route from
   * the retired assign-device above: this is a NEW, BAI-independent path for
   * first-time resolution of a still-null deviceId, not a resurrection of that
   * removed match-only action.
   */
  @Get(":id/device-candidates")
  @RequirePermission("calibrationJob", "read")
  async deviceCandidates(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Query() rawQuery: unknown,
  ): Promise<DeviceListResult> {
    const parsed = calibrationJobDeviceCandidatesQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device candidates query",
        code: "INVALID_CALIBRATION_JOB_DEVICE_CANDIDATES_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.getDeviceCandidates(companyId, id, parsed.data);
  }

  @Post(":id/select-device")
  @RequirePermission("calibrationJob", "selectDevice")
  async selectDevice(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationJobDetail> {
    const parsed = calibrationJobSelectDeviceSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device selection payload",
        code: "INVALID_CALIBRATION_JOB_SELECT_DEVICE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.selectDevice(companyId, id, parsed.data.deviceId);
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

  @Get(":id/reference-equipment-approvals")
  @RequirePermission("calibrationJob", "read")
  async listReferenceEquipmentApprovals(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<JobReferenceEquipmentApprovalDetail[]> {
    return this.service.listReferenceEquipmentApprovals(companyId, id);
  }

  @Post(":id/reference-equipment-approvals")
  @RequirePermission("calibrationJob", "submitReferenceEquipmentApproval")
  async submitReferenceEquipmentApproval(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
  ): Promise<JobReferenceEquipmentApprovalDetail> {
    return this.service.submitReferenceEquipmentApproval(companyId, id, userId);
  }

  @Post(":id/reference-equipment-approvals/:approvalId/decision")
  @RequirePermission("calibrationJob", "decideReferenceEquipmentApproval")
  async decideReferenceEquipmentApproval(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Param("approvalId") approvalId: string,
    @Body() rawBody: unknown,
  ): Promise<JobReferenceEquipmentApprovalDetail> {
    const parsed = jobReferenceEquipmentApprovalDecisionSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid reference equipment approval decision",
        code: "INVALID_REFERENCE_EQUIPMENT_APPROVAL_DECISION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.decideReferenceEquipmentApproval(
      companyId,
      id,
      approvalId,
      userId,
      parsed.data,
    );
  }

  // ── MeasurementResult (Stage 2c) ──────────────────────────────────────────
  // Nested under the job, like reference-equipment-used. The job param stays
  // `:id` (this controller's convention); the row param is `:measurementId`.

  // Catalog of directly-entered ("Pattern A") parameters for this job's device
  // type: NUMBER + DIRECT_REPLICATES + no CalibrationTestPoint children.
  // Logger-summary rows (entryStyle = LOGGER_SUMMARY) are Stage C. Read-level
  // grant, like every other GET on this controller.
  @Get(":id/measurement-parameters")
  @RequirePermission("calibrationJob", "read")
  async listMeasurementParameters(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<JobMeasurementParametersResult> {
    return this.service.listMeasurementParameters(companyId, id);
  }

  @Get(":id/worksheet-snapshot")
  @RequirePermission("calibrationJob", "read")
  async listWorksheetSnapshot(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<JobWorksheetSnapshotResult> {
    return this.service.listWorksheetSnapshot(companyId, id);
  }

  @Post(":id/worksheet-revisions")
  @RequirePermission("calibrationJob", "reviseWorksheet")
  async reviseWorksheet(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<JobWorksheetSnapshotResult> {
    const parsed = jobWorksheetRevisionSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid worksheet revision payload",
        code: "INVALID_JOB_WORKSHEET_REVISION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reviseWorksheet(companyId, id, userId, parsed.data);
  }

  @Get(":id/measurement-results")
  @RequirePermission("calibrationJob", "read")
  async listMeasurementResults(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<MeasurementResultRow[]> {
    return this.measurements.list(companyId, id);
  }

  @Post(":id/measurement-results")
  @RequirePermission("calibrationJob", "recordMeasurement")
  async createMeasurementResult(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<MeasurementResultRow> {
    const parsed = measurementResultCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid measurement result payload",
        code: "INVALID_MEASUREMENT_RESULT",
        issues: parsed.error.flatten(),
      });
    }
    return this.measurements.create(companyId, { ...parsed.data, calibrationJobId: id }, userId);
  }

  @Post(":id/measurement-results/batch")
  @RequirePermission("calibrationJob", "recordMeasurement")
  async createMeasurementResultsBatch(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<MeasurementResultRow[]> {
    const parsed = measurementResultBatchCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid measurement result batch payload",
        code: "INVALID_MEASUREMENT_RESULT_BATCH",
        issues: parsed.error.flatten(),
      });
    }
    return this.measurements.createMany(
      companyId,
      parsed.data.items.map((item) => ({ ...item, calibrationJobId: id })),
      userId,
    );
  }

  @Patch(":id/measurement-results/:measurementId")
  @RequirePermission("calibrationJob", "recordMeasurement")
  async updateMeasurementResult(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Param("measurementId") measurementId: string,
    @Body() rawBody: unknown,
  ): Promise<MeasurementResultRow> {
    const parsed = measurementResultUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid measurement result update payload",
        code: "INVALID_MEASUREMENT_RESULT_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.measurements.update(companyId, measurementId, parsed.data, userId, id);
  }

  @Delete(":id/measurement-results/:measurementId")
  @RequirePermission("calibrationJob", "recordMeasurement")
  @HttpCode(204)
  async deleteMeasurementResult(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Param("measurementId") measurementId: string,
  ): Promise<void> {
    await this.measurements.remove(companyId, measurementId, id);
  }

  // ── Physical Inspection ───────────────────────────────────────────────────
  // Nested under the job, like measurement-results. Catalog GET is read-level;
  // writes use recordPhysicalCheck (TECHNICIAN only — not recordMeasurement).

  @Get(":id/physical-check-items")
  @RequirePermission("calibrationJob", "read")
  async listPhysicalCheckItems(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<DevicePhysicalCheckItemRow[]> {
    return this.physicalChecks.listItems(companyId, id);
  }

  @Get(":id/physical-check-results")
  @RequirePermission("calibrationJob", "read")
  async listPhysicalCheckResults(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<PhysicalCheckResultRow[]> {
    return this.physicalChecks.list(companyId, id);
  }

  @Post(":id/physical-check-results")
  @RequirePermission("calibrationJob", "recordPhysicalCheck")
  async createPhysicalCheckResult(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<PhysicalCheckResultRow> {
    const parsed = physicalCheckResultCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid physical check result payload",
        code: "INVALID_PHYSICAL_CHECK_RESULT",
        issues: parsed.error.flatten(),
      });
    }
    return this.physicalChecks.create(
      companyId,
      { ...parsed.data, calibrationJobId: id },
      userId,
    );
  }

  @Post(":id/physical-check-results/batch")
  @RequirePermission("calibrationJob", "recordPhysicalCheck")
  async createPhysicalCheckResultsBatch(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<PhysicalCheckResultRow[]> {
    const parsed = physicalCheckResultBatchCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid physical check result batch payload",
        code: "INVALID_PHYSICAL_CHECK_RESULT_BATCH",
        issues: parsed.error.flatten(),
      });
    }
    return this.physicalChecks.createMany(
      companyId,
      parsed.data.items.map((item) => ({ ...item, calibrationJobId: id })),
      userId,
    );
  }

  @Patch(":id/physical-check-results/:resultId")
  @RequirePermission("calibrationJob", "recordPhysicalCheck")
  async updatePhysicalCheckResult(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Param("resultId") resultId: string,
    @Body() rawBody: unknown,
  ): Promise<PhysicalCheckResultRow> {
    const parsed = physicalCheckResultUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid physical check result update payload",
        code: "INVALID_PHYSICAL_CHECK_RESULT_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.physicalChecks.update(companyId, resultId, parsed.data, userId, id);
  }

  @Delete(":id/physical-check-results/:resultId")
  @RequirePermission("calibrationJob", "recordPhysicalCheck")
  @HttpCode(204)
  async deletePhysicalCheckResult(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Param("resultId") resultId: string,
  ): Promise<void> {
    await this.physicalChecks.remove(companyId, resultId, id);
  }

  // ── Kontrol Alat (F.MU.08) ────────────────────────────────────────────────
  // Nested under the job. GET is read-level; writes use recordKontrolAlat.
  // ON_SITE is rejected in the service (KONTROL_ALAT_NOT_APPLICABLE).

  @Get(":id/kontrol-alat")
  @RequirePermission("calibrationJob", "read")
  async getKontrolAlat(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<KontrolAlatDetail> {
    return this.kontrolAlat.get(companyId, id);
  }

  @Patch(":id/kontrol-alat")
  @RequirePermission("calibrationJob", "recordKontrolAlat")
  async patchKontrolAlat(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<KontrolAlatDetail> {
    const parsed = kontrolAlatPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid Kontrol Alat payload",
        code: "INVALID_KONTROL_ALAT",
        issues: parsed.error.flatten(),
      });
    }
    return this.kontrolAlat.patch(companyId, id, userId, parsed.data);
  }

  @Post(":id/kontrol-alat/accessories")
  @RequirePermission("calibrationJob", "recordKontrolAlat")
  async addKontrolAlatAccessory(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<KontrolAlatDetail> {
    const parsed = kontrolAlatAccessoryCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid Kontrol Alat accessory payload",
        code: "INVALID_KONTROL_ALAT_ACCESSORY",
        issues: parsed.error.flatten(),
      });
    }
    return this.kontrolAlat.addAccessory(companyId, id, userId, parsed.data);
  }

  @Patch(":id/kontrol-alat/accessories/:accessoryId")
  @RequirePermission("calibrationJob", "recordKontrolAlat")
  async updateKontrolAlatAccessory(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Param("accessoryId") accessoryId: string,
    @Body() rawBody: unknown,
  ): Promise<KontrolAlatDetail> {
    const parsed = kontrolAlatAccessoryUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid Kontrol Alat accessory update",
        code: "INVALID_KONTROL_ALAT_ACCESSORY_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.kontrolAlat.updateAccessory(companyId, id, accessoryId, parsed.data);
  }

  @Delete(":id/kontrol-alat/accessories/:accessoryId")
  @RequirePermission("calibrationJob", "recordKontrolAlat")
  @HttpCode(204)
  async deleteKontrolAlatAccessory(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Param("accessoryId") accessoryId: string,
  ): Promise<void> {
    await this.kontrolAlat.removeAccessory(companyId, id, accessoryId);
  }

  @Post(":id/kontrol-alat/signatures")
  @RequirePermission("calibrationJob", "recordKontrolAlat")
  async signKontrolAlat(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<KontrolAlatDetail> {
    const parsed = kontrolAlatSignatureCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid Kontrol Alat signature payload",
        code: "INVALID_KONTROL_ALAT_SIGNATURE",
        issues: parsed.error.flatten(),
      });
    }
    return this.kontrolAlat.sign(companyId, id, userId, parsed.data);
  }

  @Get(":id/kontrol-alat/pdf")
  @RequirePermission("calibrationJob", "read")
  async downloadKontrolAlatPdf(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const pdf = await this.kontrolAlat.buildPdf(companyId, id);
    return new StreamableFile(pdf.buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${pdf.filename}"`,
    });
  }

  /**
   * LK Result PDF Download v1 — step 1: re-enter password immediately before
   * download. Returns a short-lived, single-use, job-scoped token; does NOT
   * download the PDF itself. `calibrationJob:read` is reused deliberately —
   * see lk-download.service.ts for why no new permission was added.
   */
  @Post(":id/lk/reauth")
  @RequirePermission("calibrationJob", "read")
  async requestLkDownloadReauth(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @UserEmail() userEmail: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
    @Req() request: Request,
  ): Promise<{ token: string; expiresAt: string }> {
    const parsed = lkDownloadReauthSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid LK download re-authentication payload",
        code: "INVALID_LK_DOWNLOAD_REAUTH",
        issues: parsed.error.flatten(),
      });
    }
    const result = await this.lkDownload.requestReauth(
      companyId,
      userId,
      userEmail,
      id,
      parsed.data.password,
      { ipAddress: request.ip ?? null, userAgent: request.headers["user-agent"] ?? null },
    );
    return { token: result.token, expiresAt: result.expiresAt.toISOString() };
  }

  /**
   * LK Result PDF Download v1 — step 2: consume the step-up token from
   * `reauth` above and stream the generated PDF. The token is single-use and
   * job-scoped — see LkDownloadService.consumeToken.
   */
  @Get(":id/lk/pdf")
  @RequirePermission("calibrationJob", "read")
  async downloadLkResultPdf(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
    @Query("token") token: string | undefined,
    @Req() request: Request,
  ): Promise<StreamableFile> {
    if (!token) {
      throw new BadRequestException({
        message: "Missing LK download authorization token",
        code: "LK_DOWNLOAD_TOKEN_MISSING",
      });
    }
    const pdf = await this.lkDownload.downloadPdf(companyId, userId, id, token, {
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    return new StreamableFile(pdf.buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${pdf.filename}"`,
    });
  }
}
