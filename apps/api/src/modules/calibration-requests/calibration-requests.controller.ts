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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  calibrationRequestCreateSchema,
  calibrationRequestImportConfirmSchema,
  calibrationRequestListQuerySchema,
  calibrationRequestUpdateSchema,
  type CalibrationRequestImportPreviewResponse,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import type { UploadedFile as UploadedFileShape } from "../files/files.constants";
import {
  CalibrationRequestImportService,
  MAX_IMPORT_BYTES,
} from "./calibration-request-import.service";
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
    @Inject(CalibrationRequestImportService)
    private readonly importService: CalibrationRequestImportService,
  ) {}

  /**
   * Excel import — Preview. Side-effect free: parses, validates, matches
   * DeviceTypes, and reports the qty-explosion plan. Writes nothing.
   */
  @Post("import/preview")
  @RequirePermission("calibrationRequest", "create")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  async importPreview(
    @UploadedFile() file: UploadedFileShape | undefined,
  ): Promise<CalibrationRequestImportPreviewResponse> {
    return this.importService.preview(file);
  }

  /**
   * Excel import — Confirm. Transactional: reuses CalibrationRequestsService.create
   * with the exploded, user-resolved items.
   */
  @Post("import/confirm")
  @RequirePermission("calibrationRequest", "create")
  async importConfirm(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationRequestWithItems> {
    const parsed = calibrationRequestImportConfirmSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid import confirmation payload",
        code: "INVALID_CALIBRATION_REQUEST_IMPORT",
        issues: parsed.error.flatten(),
      });
    }
    return this.importService.confirm(companyId, userId, parsed.data);
  }

  @Post()
  @RequirePermission("calibrationRequest", "create")
  async create(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationRequestWithItems> {
    const parsed = calibrationRequestCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid requisition payload",
        code: "INVALID_CALIBRATION_REQUEST",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(companyId, userId, parsed.data);
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
        message: "Invalid requisition list query",
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
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationRequestWithItems> {
    const parsed = calibrationRequestUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid requisition update",
        code: "INVALID_CALIBRATION_REQUEST_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, userId, parsed.data);
  }

  @Post(":id/cancel")
  @RequirePermission("calibrationRequest", "cancel")
  async cancel(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
  ): Promise<CalibrationRequestWithItems> {
    return this.service.cancel(companyId, id, userId);
  }

  @Post(":id/submit")
  @RequirePermission("calibrationRequest", "update")
  async submit(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
  ): Promise<CalibrationRequestWithItems> {
    return this.service.submit(companyId, id, userId);
  }
}
