import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MasterCodeService, prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  DEVICE_MODEL_SORTABLE_FIELDS,
  type DeviceModelCreateInput,
  type DeviceModelListQuery,
  type DeviceModelUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const manufacturerSelect = { id: true, code: true, name: true } as const;

export type DeviceModelWithManufacturer = Prisma.DeviceModelGetPayload<{
  include: { manufacturer: { select: { id: true; code: true; name: true } } };
}>;

export interface DeviceModelListResult {
  data: DeviceModelWithManufacturer[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class DeviceModelsService {
  private async assertManufacturerExists(manufacturerId: string): Promise<void> {
    const manufacturer = await prisma.deviceManufacturer.findUnique({
      where: { id: manufacturerId },
    });
    if (!manufacturer) {
      throw new BadRequestException({
        message: "Device manufacturer not found",
        code: "DEVICE_MANUFACTURER_NOT_FOUND",
      });
    }
  }

  private async assertUniqueCombination(
    manufacturerId: string,
    model: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await prisma.deviceModel.findFirst({
      where: {
        manufacturerId,
        model: { equals: model, mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "A device model with this model name already exists for this manufacturer",
        code: "DUPLICATE_DEVICE_MODEL",
        existingId: duplicate.id,
      });
    }
  }

  async create(input: DeviceModelCreateInput): Promise<DeviceModelWithManufacturer> {
    await this.assertManufacturerExists(input.manufacturerId);
    await this.assertUniqueCombination(input.manufacturerId, input.model);

    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({ entity: "DEVICE_MODEL", tx });
      return tx.deviceModel.create({
        data: {
          code,
          manufacturerId: input.manufacturerId,
          model: input.model,
          description: input.description,
        },
        include: { manufacturer: { select: manufacturerSelect } },
      });
    });
  }

  async findAll(query: DeviceModelListQuery): Promise<DeviceModelListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceModelWhereInput = {
      ...(query.manufacturerId ? { manufacturerId: query.manufacturerId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
              { manufacturer: { name: { contains: query.search, mode: "insensitive" } } },
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

    // `manufacturer` is the Device Model "Manufacturer" column — a relational
    // sort on the parent DeviceManufacturer, not a scalar column (mirrors
    // PriceListItem's `deviceName` sort). Always `id`-tie-broken so pagination
    // stays deterministic when two rows share a sort value.
    const orderBy: Prisma.DeviceModelOrderByWithRelationInput[] =
      sortField === "manufacturer"
        ? [{ manufacturer: { name: sortDir } }, { id: "desc" }]
        : [{ [sortField]: sortDir }, { id: "desc" }];

    const [total, data] = await Promise.all([
      prisma.deviceModel.count({ where }),
      prisma.deviceModel.findMany({
        where,
        include: { manufacturer: { select: manufacturerSelect } },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<DeviceModelWithManufacturer> {
    const deviceModel = await prisma.deviceModel.findUnique({
      where: { id },
      include: { manufacturer: { select: manufacturerSelect } },
    });
    if (!deviceModel) {
      throw new NotFoundException({
        message: "Device model not found",
        code: "DEVICE_MODEL_NOT_FOUND",
      });
    }
    return deviceModel;
  }

  async update(id: string, input: DeviceModelUpdateInput): Promise<DeviceModelWithManufacturer> {
    const existing = await this.findOne(id);

    const nextManufacturerId = input.manufacturerId ?? existing.manufacturerId;
    const nextModel = input.model ?? existing.model;

    if (
      input.manufacturerId !== undefined &&
      input.manufacturerId !== existing.manufacturerId
    ) {
      await this.assertManufacturerExists(input.manufacturerId);
    }

    const combinationChanged =
      nextManufacturerId !== existing.manufacturerId ||
      nextModel.toLowerCase() !== existing.model.toLowerCase();

    if (combinationChanged) {
      await this.assertUniqueCombination(nextManufacturerId, nextModel, id);
    }

    return prisma.deviceModel.update({
      where: { id },
      data: {
        ...(input.manufacturerId !== undefined ? { manufacturerId: input.manufacturerId } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { manufacturer: { select: manufacturerSelect } },
    });
  }

  async remove(id: string): Promise<DeviceModelWithManufacturer> {
    const existing = await this.findOne(id);
    await prisma.deviceModel.delete({ where: { id: existing.id } });
    return existing;
  }
}
