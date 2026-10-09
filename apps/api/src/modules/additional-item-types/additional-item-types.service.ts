import { Injectable, NotFoundException } from "@nestjs/common";
import { MasterCodeService, Prisma, prisma } from "@medcal/db";
import type { AdditionalItemType } from "@medcal/db";
import {
  ADDITIONAL_ITEM_TYPE_SORTABLE_FIELDS,
  type AdditionalItemTypeCreateInput,
  type AdditionalItemTypeListQuery,
  type AdditionalItemTypeUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

export interface AdditionalItemTypeListResult {
  data: AdditionalItemType[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Catalog of commercial quotation add-ons (e.g. ON_SITE accommodation). A pure
 * reference/default source: quotations and POs snapshot what they use, so
 * changing or deactivating a type never alters an existing document. Types are
 * deactivated, never deleted (documents keep a Restrict FK for traceability).
 * There is intentionally no customer-eligibility concept.
 */
@Injectable()
export class AdditionalItemTypesService {
  async create(
    companyId: string,
    input: AdditionalItemTypeCreateInput,
  ): Promise<AdditionalItemType> {
    // `code` is system-issued (ADC-001, …), allocated in the same transaction as the insert.
    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({
        entity: "ADDITIONAL_ITEM_TYPE",
        companyId,
        tx,
      });
      return tx.additionalItemType.create({
        data: {
          companyId,
          code,
          name: input.name,
          unitLabel: input.unitLabel,
          multiplierLabel: input.multiplierLabel ?? null,
          defaultUnitPrice:
            input.defaultUnitPrice != null ? new Prisma.Decimal(input.defaultUnitPrice) : null,
          serviceMode: input.serviceMode ?? null,
        },
      });
    });
  }

  async findAll(
    companyId: string,
    query: AdditionalItemTypeListQuery,
  ): Promise<AdditionalItemTypeListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.AdditionalItemTypeWhereInput = {
      companyId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      // A type is usable for a requisition mode when it is unrestricted or matches.
      ...(query.serviceMode
        ? { OR: [{ serviceMode: null }, { serviceMode: query.serviceMode }] }
        : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { code: { contains: query.search, mode: "insensitive" } },
                  { name: { contains: query.search, mode: "insensitive" } },
                ],
              },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      ADDITIONAL_ITEM_TYPE_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "code",
    );

    const [total, data] = await Promise.all([
      prisma.additionalItemType.count({ where }),
      prisma.additionalItemType.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<AdditionalItemType> {
    const row = await prisma.additionalItemType.findFirst({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException({
        message: "Additional item type not found",
        code: "ADDITIONAL_ITEM_TYPE_NOT_FOUND",
      });
    }
    return row;
  }

  async update(
    companyId: string,
    id: string,
    input: AdditionalItemTypeUpdateInput,
  ): Promise<AdditionalItemType> {
    const existing = await this.findOne(companyId, id);
    return prisma.additionalItemType.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.unitLabel !== undefined ? { unitLabel: input.unitLabel } : {}),
        ...(input.multiplierLabel !== undefined ? { multiplierLabel: input.multiplierLabel } : {}),
        ...(input.defaultUnitPrice !== undefined
          ? {
              defaultUnitPrice:
                input.defaultUnitPrice === null ? null : new Prisma.Decimal(input.defaultUnitPrice),
            }
          : {}),
        ...(input.serviceMode !== undefined ? { serviceMode: input.serviceMode } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }
}
