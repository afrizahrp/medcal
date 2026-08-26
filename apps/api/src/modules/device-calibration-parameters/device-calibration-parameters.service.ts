import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS,
  type DeviceCalibrationParameterCreateInput,
  type DeviceCalibrationParameterListQuery,
  type DeviceCalibrationParameterUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = { id: true, code: true, name: true } as const;

const capabilityItemInclude = {
  id: true,
  code: true,
  name: true,
  capabilityId: true,
  capability: { select: { id: true, code: true, name: true } },
} as const;

const uomSelect = { id: true, code: true, name: true, symbol: true } as const;

const parameterInclude = {
  deviceType: { select: deviceTypeSelect },
  capabilityItem: { select: capabilityItemInclude },
  uom: { select: uomSelect },
} as const;

export type DeviceCalibrationParameterWithRelations = Prisma.DeviceCalibrationParameterGetPayload<{
  include: {
    deviceType: { select: { id: true; code: true; name: true } };
    capabilityItem: {
      select: {
        id: true;
        code: true;
        name: true;
        capabilityId: true;
        capability: { select: { id: true; code: true; name: true } };
      };
    };
    uom: { select: { id: true; code: true; name: true; symbol: true } };
  };
}>;

export interface DeviceCalibrationParameterListResult {
  data: DeviceCalibrationParameterWithRelations[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class DeviceCalibrationParametersService {
  private async assertDeviceTypeExists(deviceTypeId: string): Promise<void> {
    const deviceType = await prisma.deviceType.findUnique({ where: { id: deviceTypeId } });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
  }

  private async assertCapabilityItemExists(capabilityItemId: string): Promise<void> {
    const item = await prisma.deviceCapabilityItem.findUnique({ where: { id: capabilityItemId } });
    if (!item) {
      throw new BadRequestException({
        message: "Device capability item not found",
        code: "DEVICE_CAPABILITY_ITEM_NOT_FOUND",
      });
    }
  }

  private async assertUomExists(uomId: string): Promise<void> {
    const uom = await prisma.uom.findUnique({ where: { id: uomId } });
    if (!uom) {
      throw new BadRequestException({
        message: "UOM not found",
        code: "UOM_NOT_FOUND",
      });
    }
  }

  private assertToleranceBounds(min: number | null | undefined, max: number | null | undefined): void {
    if (min != null && max != null && min > max) {
      throw new BadRequestException({
        message: "toleranceMin must be less than or equal to toleranceMax",
        code: "INVALID_CALIBRATION_TOLERANCE",
      });
    }
  }

  private async assertUniqueCode(
    deviceTypeId: string,
    capabilityItemId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await prisma.deviceCalibrationParameter.findFirst({
      where: {
        deviceTypeId,
        capabilityItemId,
        code,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message:
          "A calibration parameter with this code already exists for this device type and capability item",
        code: "DUPLICATE_DEVICE_CALIBRATION_PARAMETER_CODE",
        existingId: duplicate.id,
      });
    }
  }

  async create(
    input: DeviceCalibrationParameterCreateInput,
  ): Promise<DeviceCalibrationParameterWithRelations> {
    await this.assertDeviceTypeExists(input.deviceTypeId);
    await this.assertCapabilityItemExists(input.capabilityItemId);
    await this.assertUomExists(input.uomId);
    this.assertToleranceBounds(input.toleranceMin, input.toleranceMax);
    await this.assertUniqueCode(input.deviceTypeId, input.capabilityItemId, input.code);

    return prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId: input.deviceTypeId,
        capabilityItemId: input.capabilityItemId,
        code: input.code,
        name: input.name,
        description: input.description,
        uomId: input.uomId,
        toleranceMin: input.toleranceMin ?? null,
        toleranceMax: input.toleranceMax ?? null,
        toleranceNote: input.toleranceNote ?? null,
      },
      include: parameterInclude,
    });
  }

  async findAll(
    query: DeviceCalibrationParameterListQuery,
  ): Promise<DeviceCalibrationParameterListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceCalibrationParameterWhereInput = {
      ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
      ...(query.capabilityItemId ? { capabilityItemId: query.capabilityItemId } : {}),
      ...(query.capabilityId ? { capabilityItem: { capabilityId: query.capabilityId } } : {}),
      ...(query.uomId ? { uomId: query.uomId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { deviceType: { name: { contains: query.search, mode: "insensitive" } } },
              { deviceType: { code: { contains: query.search, mode: "insensitive" } } },
              { capabilityItem: { name: { contains: query.search, mode: "insensitive" } } },
              { capabilityItem: { code: { contains: query.search, mode: "insensitive" } } },
              {
                capabilityItem: {
                  capability: { name: { contains: query.search, mode: "insensitive" } },
                },
              },
              { uom: { name: { contains: query.search, mode: "insensitive" } } },
              { uom: { code: { contains: query.search, mode: "insensitive" } } },
              { uom: { symbol: { contains: query.search, mode: "insensitive" } } },
              { toleranceNote: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.deviceCalibrationParameter.count({ where }),
      prisma.deviceCalibrationParameter.findMany({
        where,
        include: parameterInclude,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<DeviceCalibrationParameterWithRelations> {
    const parameter = await prisma.deviceCalibrationParameter.findUnique({
      where: { id },
      include: parameterInclude,
    });
    if (!parameter) {
      throw new NotFoundException({
        message: "Device calibration parameter not found",
        code: "DEVICE_CALIBRATION_PARAMETER_NOT_FOUND",
      });
    }
    return parameter;
  }

  async update(
    id: string,
    input: DeviceCalibrationParameterUpdateInput,
  ): Promise<DeviceCalibrationParameterWithRelations> {
    const existing = await this.findOne(id);

    const nextDeviceTypeId = input.deviceTypeId ?? existing.deviceTypeId;
    const nextCapabilityItemId = input.capabilityItemId ?? existing.capabilityItemId;
    const nextCode = input.code ?? existing.code;

    if (input.deviceTypeId !== undefined && input.deviceTypeId !== existing.deviceTypeId) {
      await this.assertDeviceTypeExists(input.deviceTypeId);
    }
    if (input.capabilityItemId !== undefined && input.capabilityItemId !== existing.capabilityItemId) {
      await this.assertCapabilityItemExists(input.capabilityItemId);
    }
    if (input.uomId !== undefined && input.uomId !== existing.uomId) {
      await this.assertUomExists(input.uomId);
    }

    const nextMin =
      input.toleranceMin !== undefined
        ? (input.toleranceMin ?? null)
        : existing.toleranceMin == null
          ? null
          : Number(existing.toleranceMin);
    const nextMax =
      input.toleranceMax !== undefined
        ? (input.toleranceMax ?? null)
        : existing.toleranceMax == null
          ? null
          : Number(existing.toleranceMax);
    this.assertToleranceBounds(nextMin, nextMax);

    const uniqueChanged =
      nextDeviceTypeId !== existing.deviceTypeId ||
      nextCapabilityItemId !== existing.capabilityItemId ||
      nextCode !== existing.code;

    if (uniqueChanged) {
      await this.assertUniqueCode(nextDeviceTypeId, nextCapabilityItemId, nextCode, id);
    }

    return prisma.deviceCalibrationParameter.update({
      where: { id },
      data: {
        ...(input.deviceTypeId !== undefined ? { deviceTypeId: input.deviceTypeId } : {}),
        ...(input.capabilityItemId !== undefined ? { capabilityItemId: input.capabilityItemId } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.uomId !== undefined ? { uomId: input.uomId } : {}),
        ...(input.toleranceMin !== undefined ? { toleranceMin: input.toleranceMin } : {}),
        ...(input.toleranceMax !== undefined ? { toleranceMax: input.toleranceMax } : {}),
        ...(input.toleranceNote !== undefined ? { toleranceNote: input.toleranceNote } : {}),
      },
      include: parameterInclude,
    });
  }

  async remove(id: string): Promise<DeviceCalibrationParameterWithRelations> {
    const existing = await this.findOne(id);
    await prisma.deviceCalibrationParameter.delete({ where: { id: existing.id } });
    return existing;
  }
}
