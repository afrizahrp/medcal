import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MasterCodeService, prisma } from "@medcal/db";
import type { DeviceManufacturer, Prisma } from "@medcal/db";
import {
  DEVICE_MANUFACTURER_SORTABLE_FIELDS,
  type DeviceManufacturerCreateInput,
  type DeviceManufacturerListQuery,
  type DeviceManufacturerUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

export interface DeviceManufacturerListResult {
  data: DeviceManufacturer[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class DeviceManufacturersService {
  private async assertUniqueName(name: string, excludeId?: string): Promise<void> {
    const duplicate = await prisma.deviceManufacturer.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "A device manufacturer with this name already exists",
        code: "DUPLICATE_DEVICE_MANUFACTURER",
        existingId: duplicate.id,
      });
    }
  }

  // `code` is a system-issued, immutable business identifier (MFR-000001).
  async create(input: DeviceManufacturerCreateInput) {
    await this.assertUniqueName(input.name);

    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({ entity: "DEVICE_MANUFACTURER", tx });
      return tx.deviceManufacturer.create({
        data: {
          code,
          name: input.name,
          description: input.description,
        },
      });
    });
  }

  async findAll(query: DeviceManufacturerListQuery): Promise<DeviceManufacturerListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceManufacturerWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      DEVICE_MANUFACTURER_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.deviceManufacturer.count({ where }),
      prisma.deviceManufacturer.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string) {
    const manufacturer = await prisma.deviceManufacturer.findUnique({ where: { id } });
    if (!manufacturer) {
      throw new NotFoundException({
        message: "Device manufacturer not found",
        code: "DEVICE_MANUFACTURER_NOT_FOUND",
      });
    }
    return manufacturer;
  }

  async update(id: string, input: DeviceManufacturerUpdateInput) {
    const existing = await this.findOne(id);

    if (input.name !== undefined && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueName(input.name, id);
    }

    // `code` is immutable and system-issued — not accepted by the update schema.
    return prisma.deviceManufacturer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    const modelCount = await prisma.deviceModel.count({ where: { manufacturerId: id } });
    if (modelCount > 0) {
      throw new BadRequestException({
        message: "Cannot delete a device manufacturer that still has device models",
        code: "DEVICE_MANUFACTURER_HAS_MODELS",
      });
    }
    await prisma.deviceManufacturer.delete({ where: { id: existing.id } });
    return existing;
  }
}
