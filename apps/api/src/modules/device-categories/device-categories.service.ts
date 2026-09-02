import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MasterCodeService, prisma } from "@medcal/db";
import type { DeviceCategory, Prisma } from "@medcal/db";
import {
  DEVICE_CATEGORY_SORTABLE_FIELDS,
  type DeviceCategoryCreateInput,
  type DeviceCategoryListQuery,
  type DeviceCategoryUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

export interface DeviceCategoryListResult {
  data: DeviceCategory[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class DeviceCategoriesService {
  async create(input: DeviceCategoryCreateInput): Promise<DeviceCategory> {
    // `code` is a system-issued, immutable business identifier (DVCAT-001),
    // allocated in the same transaction as the insert. Existing slug codes on
    // pre-Phase-2 rows are left untouched and coexist.
    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({ entity: "DEVICE_CATEGORY", tx });
      return tx.deviceCategory.create({
        data: {
          code,
          name: input.name,
          description: input.description,
        },
      });
    });
  }

  async findAll(query: DeviceCategoryListQuery): Promise<DeviceCategoryListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceCategoryWhereInput = {
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
      DEVICE_CATEGORY_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.deviceCategory.count({ where }),
      prisma.deviceCategory.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<DeviceCategory> {
    const category = await prisma.deviceCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException({
        message: "Device category not found",
        code: "DEVICE_CATEGORY_NOT_FOUND",
      });
    }
    return category;
  }

  async update(id: string, input: DeviceCategoryUpdateInput): Promise<DeviceCategory> {
    await this.findOne(id);

    // `code` is immutable and system-issued — deviceCategoryUpdateSchema does
    // not accept it and it is never written here.
    return prisma.deviceCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async remove(id: string): Promise<DeviceCategory> {
    const existing = await this.findOne(id);
    const typeCount = await prisma.deviceType.count({ where: { categoryId: id } });
    if (typeCount > 0) {
      throw new BadRequestException({
        message: "Cannot delete a device category that still has device types",
        code: "DEVICE_CATEGORY_HAS_TYPES",
      });
    }
    return prisma.deviceCategory.delete({ where: { id: existing.id } });
  }
}
