import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  calibrationTestPointBulkCreateSchema,
  calibrationTestPointCreateSchema,
  calibrationTestPointGroupedReorderSchema,
  calibrationTestPointReorderSchema,
  calibrationTestPointUpdateSchema,
  deviceCalibrationParameterCapabilityOrderSchema,
  deviceCalibrationParameterCopySchema,
  deviceCalibrationParameterCreateSchema,
  deviceCalibrationParameterGroupedQuerySchema,
  deviceCalibrationParameterListQuerySchema,
  deviceCalibrationParameterParameterOrderSchema,
  deviceCalibrationParameterUpdateSchema,
} from "@medcal/shared";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  DeviceCalibrationParametersService,
  type CalibrationTestPointRow,
  type DeviceCalibrationParameterCapabilityGroup,
  type DeviceCalibrationParameterCopyResult,
  type DeviceCalibrationParameterGroupedResult,
  type DeviceCalibrationParameterListResult,
  type DeviceCalibrationParameterWithRelations,
} from "./device-calibration-parameters.service";

@Controller("device-calibration-parameters")
@UseGuards(CompanyRoleGuard)
export class DeviceCalibrationParametersController {
  constructor(
    @Inject(DeviceCalibrationParametersService)
    private readonly service: DeviceCalibrationParametersService,
  ) {}

  @Post()
  @RequirePermission("deviceCalibrationParameter", "create")
  async create(@Body() rawBody: unknown): Promise<DeviceCalibrationParameterWithRelations> {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device calibration parameter payload",
        code: "INVALID_DEVICE_CALIBRATION_PARAMETER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.create(parsed.data);
  }

  @Get()
  @RequirePermission("deviceCalibrationParameter", "read")
  async list(@Query() rawQuery: unknown): Promise<DeviceCalibrationParameterListResult> {
    const parsed = deviceCalibrationParameterListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device calibration parameter list query",
        code: "INVALID_DEVICE_CALIBRATION_PARAMETER_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(parsed.data);
  }

  @Post("copy")
  @RequirePermission("deviceCalibrationParameter", "create")
  async copy(@Body() rawBody: unknown): Promise<DeviceCalibrationParameterCopyResult> {
    const parsed = deviceCalibrationParameterCopySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device calibration parameter copy payload",
        code: "INVALID_DEVICE_CALIBRATION_PARAMETER_COPY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.copy(parsed.data);
  }

  @Get("grouped")
  @RequirePermission("deviceCalibrationParameter", "read")
  async listGrouped(@Query() rawQuery: unknown): Promise<DeviceCalibrationParameterGroupedResult> {
    const parsed = deviceCalibrationParameterGroupedQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device calibration parameter grouped query",
        code: "INVALID_DEVICE_CALIBRATION_PARAMETER_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAllGroupedByDeviceType(parsed.data);
  }

  @Patch("device-types/:deviceTypeId/capability-order")
  @RequirePermission("deviceCalibrationParameter", "update")
  async reorderCapabilities(
    @Param("deviceTypeId") deviceTypeId: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceCalibrationParameterCapabilityGroup[]> {
    const parsed = deviceCalibrationParameterCapabilityOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid capability order payload",
        code: "INVALID_CAPABILITY_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reorderCapabilities(deviceTypeId, parsed.data.capabilityIds);
  }

  @Patch("device-types/:deviceTypeId/capabilities/:capabilityId/parameter-order")
  @RequirePermission("deviceCalibrationParameter", "update")
  async reorderParameters(
    @Param("deviceTypeId") deviceTypeId: string,
    @Param("capabilityId") capabilityId: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceCalibrationParameterWithRelations[]> {
    const parsed = deviceCalibrationParameterParameterOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid parameter order payload",
        code: "INVALID_PARAMETER_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reorderParameters(deviceTypeId, capabilityId, parsed.data.parameterIds);
  }

  // ── CalibrationTestPoint (Named Measurement Points) ────────────────────────
  // Nested under one DeviceCalibrationParameter, same routing/permission
  // convention as device-capabilities.controller.ts's ":id/items". Reuses the
  // parent resource's permission ("deviceCalibrationParameter") — a user who
  // can manage the parameter catalog can manage its named points, no separate
  // permission type introduced.

  @Get(":id/test-points")
  @RequirePermission("deviceCalibrationParameter", "read")
  async listTestPoints(@Param("id") id: string): Promise<CalibrationTestPointRow[]> {
    return this.service.findTestPoints(id);
  }

  @Post(":id/test-points")
  @RequirePermission("deviceCalibrationParameter", "create")
  async createTestPoint(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationTestPointRow> {
    const parsed = calibrationTestPointCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration test point payload",
        code: "INVALID_CALIBRATION_TEST_POINT",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.createTestPoint(id, parsed.data);
  }

  /**
   * Portal "grouped titik ukur entry" — one shared row (setpoint slot)
   * created across N sibling DeviceCalibrationParameters at once (e.g. one
   * NIBP sweep across Systole/MAP/Diastole instead of one "+ Tambah Titik
   * Ukur" per parameter). Static top-level route, not `:id`-nested, since it
   * spans multiple parameters. Same permission as the single-row create —
   * no new permission type introduced.
   */
  @Post("bulk-test-points")
  @RequirePermission("deviceCalibrationParameter", "create")
  async createTestPointsBulk(@Body() rawBody: unknown): Promise<CalibrationTestPointRow[]> {
    const parsed = calibrationTestPointBulkCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid bulk calibration test point payload",
        code: "INVALID_CALIBRATION_TEST_POINT_BULK",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.createTestPointsBulk(parsed.data);
  }

  @Patch(":id/test-points/reorder")
  @RequirePermission("deviceCalibrationParameter", "update")
  async reorderTestPoints(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationTestPointRow[]> {
    const parsed = calibrationTestPointReorderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration test point order payload",
        code: "INVALID_CALIBRATION_TEST_POINT_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reorderTestPoints(id, parsed.data.testPointIds);
  }

  /**
   * Grouped Titik Ukur table's block-level chevron — moves every sibling
   * present in one block together, atomically. Static top-level route (not
   * `:id`-nested), since it spans multiple parameters, mirroring
   * `bulk-test-points`.
   */
  @Patch("grouped-test-points/reorder")
  @RequirePermission("deviceCalibrationParameter", "update")
  async reorderTestPointsGrouped(@Body() rawBody: unknown): Promise<CalibrationTestPointRow[]> {
    const parsed = calibrationTestPointGroupedReorderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid grouped calibration test point order payload",
        code: "INVALID_CALIBRATION_TEST_POINT_GROUPED_ORDER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.reorderTestPointsGrouped(parsed.data.moves);
  }

  @Patch(":id/test-points/:testPointId")
  @RequirePermission("deviceCalibrationParameter", "update")
  async updateTestPoint(
    @Param("id") id: string,
    @Param("testPointId") testPointId: string,
    @Body() rawBody: unknown,
  ): Promise<CalibrationTestPointRow> {
    const parsed = calibrationTestPointUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid calibration test point update",
        code: "INVALID_CALIBRATION_TEST_POINT_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateTestPoint(id, testPointId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("deviceCalibrationParameter", "read")
  async findOne(@Param("id") id: string): Promise<DeviceCalibrationParameterWithRelations> {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("deviceCalibrationParameter", "update")
  async update(
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<DeviceCalibrationParameterWithRelations> {
    const parsed = deviceCalibrationParameterUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid device calibration parameter update",
        code: "INVALID_DEVICE_CALIBRATION_PARAMETER_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(id, parsed.data);
  }

  @Delete(":id")
  @RequirePermission("deviceCalibrationParameter", "delete")
  async remove(@Param("id") id: string): Promise<DeviceCalibrationParameterWithRelations> {
    return this.service.remove(id);
  }
}
