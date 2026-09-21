import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MasterCodeService, prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  DEVICE_TYPE_SORTABLE_FIELDS,
  type DeviceTypeCreateInput,
  type DeviceTypeListQuery,
  type DeviceTypeUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const categorySelect = { id: true, code: true, name: true } as const;

export type DeviceTypeWithCategory = Prisma.DeviceTypeGetPayload<{
  include: { category: { select: { id: true; code: true; name: true } } };
}>;

export interface DeviceTypeListResult {
  data: DeviceTypeWithCategory[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class DeviceTypesService {
  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await prisma.deviceCategory.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new BadRequestException({
        message: "Device category not found",
        code: "DEVICE_CATEGORY_NOT_FOUND",
      });
    }
  }

  async create(input: DeviceTypeCreateInput): Promise<DeviceTypeWithCategory> {
    await this.assertCategoryExists(input.categoryId);

    // `code` is a system-issued, immutable business identifier (DVTP-001).
    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({ entity: "DEVICE_TYPE", tx });
      return tx.deviceType.create({
        data: {
          categoryId: input.categoryId,
          code,
          name: input.name,
          description: input.description,
        },
        include: { category: { select: categorySelect } },
      });
    });
  }

  async findAll(query: DeviceTypeListQuery): Promise<DeviceTypeListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceTypeWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
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
      DEVICE_TYPE_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.deviceType.count({ where }),
      prisma.deviceType.findMany({
        where,
        include: { category: { select: categorySelect } },
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<DeviceTypeWithCategory> {
    const deviceType = await prisma.deviceType.findUnique({
      where: { id },
      include: { category: { select: categorySelect } },
    });
    if (!deviceType) {
      throw new NotFoundException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
    return deviceType;
  }

  async update(id: string, input: DeviceTypeUpdateInput): Promise<DeviceTypeWithCategory> {
    const existing = await this.findOne(id);

    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      await this.assertCategoryExists(input.categoryId);
    }

    // `code` is immutable and system-issued — not accepted by the update schema.
    return prisma.deviceType.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { category: { select: categorySelect } },
    });
  }

  async remove(id: string): Promise<DeviceTypeWithCategory> {
    const existing = await this.findOne(id);
    const deviceCount = await prisma.device.count({ where: { deviceTypeId: id } });
    if (deviceCount > 0) {
      throw new BadRequestException({
        message: "Cannot delete a device type that still has devices",
        code: "DEVICE_TYPE_HAS_DEVICES",
      });
    }
    const requestItemCount = await prisma.calibrationRequestItem.count({
      where: { deviceTypeId: id },
    });
    if (requestItemCount > 0) {
      throw new BadRequestException({
        message: "Cannot delete a device type that is used by requisitions",
        code: "DEVICE_TYPE_HAS_CALIBRATION_REQUESTS",
      });
    }
    await prisma.deviceType.delete({ where: { id: existing.id } });
    return existing;
  }
}
