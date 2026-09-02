import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  DEVICE_MODEL_SORTABLE_FIELDS,
  type DeviceModelCreateInput,
  type DeviceModelListQuery,
  type DeviceModelUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = { id: true, code: true, name: true } as const;

export type DeviceModelWithType = Prisma.DeviceModelGetPayload<{
  include: { deviceType: { select: { id: true; code: true; name: true } } };
}>;

export interface DeviceModelListResult {
  data: DeviceModelWithType[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class DeviceModelsService {
  private async assertDeviceTypeExists(deviceTypeId: string): Promise<void> {
    const deviceType = await prisma.deviceType.findUnique({ where: { id: deviceTypeId } });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
  }

  private async assertUniqueCombination(
    deviceTypeId: string,
    manufacturer: string,
    model: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await prisma.deviceModel.findFirst({
      where: {
        deviceTypeId,
        manufacturer: { equals: manufacturer, mode: "insensitive" },
        model: { equals: model, mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message:
          "A device model with this manufacturer and model already exists for this device type",
        code: "DUPLICATE_DEVICE_MODEL",
        existingId: duplicate.id,
      });
    }
  }

  async create(input: DeviceModelCreateInput): Promise<DeviceModelWithType> {
    await this.assertDeviceTypeExists(input.deviceTypeId);
    await this.assertUniqueCombination(input.deviceTypeId, input.manufacturer, input.model);

    return prisma.deviceModel.create({
      data: {
        deviceTypeId: input.deviceTypeId,
        manufacturer: input.manufacturer,
        model: input.model,
        description: input.description,
      },
      include: { deviceType: { select: deviceTypeSelect } },
    });
  }

  async findAll(query: DeviceModelListQuery): Promise<DeviceModelListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceModelWhereInput = {
      ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { manufacturer: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
              { deviceType: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      DEVICE_MODEL_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.deviceModel.count({ where }),
      prisma.deviceModel.findMany({
        where,
        include: { deviceType: { select: deviceTypeSelect } },
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<DeviceModelWithType> {
    const deviceModel = await prisma.deviceModel.findUnique({
      where: { id },
      include: { deviceType: { select: deviceTypeSelect } },
    });
    if (!deviceModel) {
      throw new NotFoundException({
        message: "Device model not found",
        code: "DEVICE_MODEL_NOT_FOUND",
      });
    }
    return deviceModel;
  }

  async update(id: string, input: DeviceModelUpdateInput): Promise<DeviceModelWithType> {
    const existing = await this.findOne(id);

    const nextDeviceTypeId = input.deviceTypeId ?? existing.deviceTypeId;
    const nextManufacturer = input.manufacturer ?? existing.manufacturer;
    const nextModel = input.model ?? existing.model;

    if (input.deviceTypeId !== undefined && input.deviceTypeId !== existing.deviceTypeId) {
      await this.assertDeviceTypeExists(input.deviceTypeId);
    }

    const combinationChanged =
      nextDeviceTypeId !== existing.deviceTypeId ||
      nextManufacturer.toLowerCase() !== existing.manufacturer.toLowerCase() ||
      nextModel.toLowerCase() !== existing.model.toLowerCase();

    if (combinationChanged) {
      await this.assertUniqueCombination(nextDeviceTypeId, nextManufacturer, nextModel, id);
    }

    return prisma.deviceModel.update({
      where: { id },
      data: {
        ...(input.deviceTypeId !== undefined ? { deviceTypeId: input.deviceTypeId } : {}),
        ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { deviceType: { select: deviceTypeSelect } },
    });
  }

  async remove(id: string): Promise<DeviceModelWithType> {
    const existing = await this.findOne(id);
    await prisma.deviceModel.delete({ where: { id: existing.id } });
    return existing;
  }
}
