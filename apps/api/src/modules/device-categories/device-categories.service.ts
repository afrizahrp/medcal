import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { DeviceCategory, Prisma } from "@medcal/db";
import {
  DEVICE_CATEGORY_SORTABLE_FIELDS,
  type DeviceCategoryCreateInput,
  type DeviceCategoryListQuery,
  type DeviceCategoryUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

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
    const existing = await prisma.deviceCategory.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw new ConflictException({
        message: "A device category with this code already exists",
        code: "DUPLICATE_DEVICE_CATEGORY_CODE",
        existingId: existing.id,
      });
    }

    return prisma.deviceCategory.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
      },
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
        orderBy: { [sortField]: sortDir },
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
    const existing = await this.findOne(id);

    if (input.code !== undefined && input.code !== existing.code) {
      const duplicate = await prisma.deviceCategory.findUnique({ where: { code: input.code } });
      if (duplicate) {
        throw new ConflictException({
          message: "A device category with this code already exists",
          code: "DUPLICATE_DEVICE_CATEGORY_CODE",
          existingId: duplicate.id,
        });
      }
    }

    return prisma.deviceCategory.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
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
