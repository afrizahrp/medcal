import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Prisma, Uom } from "@medcal/db";
import {
  UOM_SORTABLE_FIELDS,
  type UomCreateInput,
  type UomListQuery,
  type UomUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

export interface UomListResult {
  data: Uom[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class UomsService {
  async create(input: UomCreateInput): Promise<Uom> {
    const existing = await prisma.uom.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw new ConflictException({
        message: "A UOM with this code already exists",
        code: "DUPLICATE_UOM_CODE",
        existingId: existing.id,
      });
    }

    return prisma.uom.create({
      data: {
        code: input.code,
        name: input.name,
        symbol: input.symbol,
        category: input.category,
      },
    });
  }

  async findAll(query: UomListQuery): Promise<UomListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.UomWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { symbol: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      UOM_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.uom.count({ where }),
      prisma.uom.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<Uom> {
    const uom = await prisma.uom.findUnique({ where: { id } });
    if (!uom) {
      throw new NotFoundException({ message: "UOM not found", code: "UOM_NOT_FOUND" });
    }
    return uom;
  }

  async update(id: string, input: UomUpdateInput): Promise<Uom> {
    const existing = await prisma.uom.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ message: "UOM not found", code: "UOM_NOT_FOUND" });
    }

    if (input.code !== undefined && input.code !== existing.code) {
      const duplicate = await prisma.uom.findUnique({ where: { code: input.code } });
      if (duplicate) {
        throw new ConflictException({
          message: "A UOM with this code already exists",
          code: "DUPLICATE_UOM_CODE",
          existingId: duplicate.id,
        });
      }
    }

    return prisma.uom.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }
}
