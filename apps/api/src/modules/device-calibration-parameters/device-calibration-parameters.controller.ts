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
  deviceCalibrationParameterCapabilityOrderSchema,
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
  type DeviceCalibrationParameterCapabilityGroup,
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
