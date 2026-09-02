import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Prisma, Tax } from "@medcal/db";
import {
  TAX_SORTABLE_FIELDS,
  type TaxCreateInput,
  type TaxListQuery,
  type TaxUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

export interface TaxListResult {
  data: Tax[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class TaxesService {
  async create(companyId: string, input: TaxCreateInput): Promise<Tax> {
    await this.assertUniqueTaxCode(companyId, input.taxCode);

    return prisma.tax.create({
      data: {
        companyId,
        taxCode: input.taxCode,
        description: input.description,
        taxRate: input.taxRate,
        ...(input.isExclude !== undefined ? { isExclude: input.isExclude } : {}),
      },
    });
  }

  async findAll(companyId: string, query: TaxListQuery): Promise<TaxListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.TaxWhereInput = {
      companyId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { taxCode: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      TAX_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.tax.count({ where }),
      prisma.tax.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async listActive(companyId: string): Promise<Tax[]> {
    return prisma.tax.findMany({
      where: { companyId, isActive: true },
      orderBy: { taxCode: "asc" },
    });
  }

  async findOne(companyId: string, id: string): Promise<Tax> {
    const tax = await prisma.tax.findFirst({ where: { id, companyId } });
    if (!tax) {
      throw new NotFoundException({ message: "Tax not found", code: "TAX_NOT_FOUND" });
    }
    return tax;
  }

  async update(companyId: string, id: string, input: TaxUpdateInput): Promise<Tax> {
    const existing = await this.findOne(companyId, id);

    if (input.taxCode !== undefined && input.taxCode !== existing.taxCode) {
      await this.assertUniqueTaxCode(companyId, input.taxCode, id);
    }

    return prisma.tax.update({
      where: { id: existing.id },
      data: {
        ...(input.taxCode !== undefined ? { taxCode: input.taxCode } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.isExclude !== undefined ? { isExclude: input.isExclude } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  private async assertUniqueTaxCode(companyId: string, taxCode: string, excludeId?: string) {
    const duplicate = await prisma.tax.findUnique({
      where: { companyId_taxCode: { companyId, taxCode } },
    });
    if (duplicate && duplicate.id !== excludeId) {
      throw new ConflictException({
        message: "A tax with this code already exists",
        code: "DUPLICATE_TAX_CODE",
        existingId: duplicate.id,
      });
    }
  }
}
