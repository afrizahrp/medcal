import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MasterCodeService, prisma } from "@medcal/db";
import type { EquipmentType, Prisma } from "@medcal/db";
import {
  EQUIPMENT_TYPE_SORTABLE_FIELDS,
  type EquipmentTypeCreateInput,
  type EquipmentTypeListQuery,
  type EquipmentTypeUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

export interface EquipmentTypeListResult {
  data: EquipmentType[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class EquipmentTypesService {
  async create(input: EquipmentTypeCreateInput): Promise<EquipmentType> {
    // `code` is a system-issued, immutable business identifier (EQTP-001).
    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({ entity: "EQUIPMENT_TYPE", tx });
      return tx.equipmentType.create({
        data: {
          code,
          name: input.name,
          description: input.description,
          category: input.category,
        },
      });
    });
  }

  async findAll(query: EquipmentTypeListQuery): Promise<EquipmentTypeListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.EquipmentTypeWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { category: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      EQUIPMENT_TYPE_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.equipmentType.count({ where }),
      prisma.equipmentType.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<EquipmentType> {
    const equipmentType = await prisma.equipmentType.findUnique({ where: { id } });
    if (!equipmentType) {
      throw new NotFoundException({
        message: "Equipment type not found",
        code: "EQUIPMENT_TYPE_NOT_FOUND",
      });
    }
    return equipmentType;
  }

  async update(id: string, input: EquipmentTypeUpdateInput): Promise<EquipmentType> {
    await this.findOne(id);

    // `code` is immutable and system-issued — not accepted by the update schema.
    return prisma.equipmentType.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async remove(id: string): Promise<EquipmentType> {
    const existing = await this.findOne(id);
    const requirementCount = await prisma.deviceTypeEquipmentRequirement.count({
      where: { equipmentTypeId: id },
    });
    if (requirementCount > 0) {
      throw new BadRequestException({
        message: "Cannot delete an equipment type that is still required by a device type",
        code: "EQUIPMENT_TYPE_HAS_REQUIREMENTS",
      });
    }
    return prisma.equipmentType.delete({ where: { id: existing.id } });
  }
}
