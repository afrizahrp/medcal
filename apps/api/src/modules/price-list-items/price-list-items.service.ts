import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import {
  PRICE_LIST_ITEM_SORTABLE_FIELDS,
  type PriceListItemCreateInput,
  type PriceListItemListQuery,
  type PriceListItemUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = { id: true, code: true, name: true } as const;

export type PriceListItemWithType = Prisma.PriceListItemGetPayload<{
  include: { deviceType: { select: typeof deviceTypeSelect } };
}>;

export interface PriceListItemListResult {
  data: PriceListItemWithType[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ResolvedPrice {
  priceListItemId: string;
  unitPrice: Prisma.Decimal;
  currency: string;
}

/** Far-future sentinel standing in for an open-ended `effectiveUntil`. */
const OPEN_ENDED = new Date(8640000000000000);

/** Strip time — Prisma `@db.Date` columns are date-only; compare like-for-like. */
function toDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function windowsOverlap(
  aFrom: Date,
  aUntil: Date | null,
  bFrom: Date,
  bUntil: Date | null,
): boolean {
  const aEnd = aUntil ?? OPEN_ENDED;
  const bEnd = bUntil ?? OPEN_ENDED;
  return aFrom.getTime() <= bEnd.getTime() && bFrom.getTime() <= aEnd.getTime();
}

/**
 * The applicable Price List tariff for a DeviceType on a given date — the active
 * row whose [effectiveFrom, effectiveUntil] window contains `onDate`. Used at
 * quotation generation time; the result is snapshotted into
 * QuotationItem.unitPrice and never re-read afterwards. Accepts a transaction
 * client so it participates in the quotation-create transaction.
 */
export async function resolveActivePriceListItem(
  client: Prisma.TransactionClient | typeof prisma,
  companyId: string,
  deviceTypeId: string,
  onDate: Date,
): Promise<ResolvedPrice | null> {
  const day = toDateOnly(onDate);
  const rows = await client.priceListItem.findMany({
    where: {
      companyId,
      deviceTypeId,
      isActive: true,
      effectiveFrom: { lte: day },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: day } }],
    },
    orderBy: { effectiveFrom: "desc" },
    take: 1,
  });
  const row = rows[0];
  if (!row) return null;
  return { priceListItemId: row.id, unitPrice: row.unitPrice, currency: row.currency };
}

@Injectable()
export class PriceListItemsService {
  private async assertDeviceTypeExists(deviceTypeId: string): Promise<void> {
    const deviceType = await prisma.deviceType.findUnique({ where: { id: deviceTypeId } });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
  }

  /**
   * Reject a second *active* tariff whose effective window overlaps an existing
   * active tariff for the same (company, DeviceType) — that would make the
   * quotation-time lookup ambiguous. Inactive rows are ignored (kept for history).
   */
  private async assertNoActiveOverlap(
    companyId: string,
    deviceTypeId: string,
    effectiveFrom: Date,
    effectiveUntil: Date | null,
    exceptId?: string,
  ): Promise<void> {
    const siblings = await prisma.priceListItem.findMany({
      where: {
        companyId,
        deviceTypeId,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true, effectiveFrom: true, effectiveUntil: true },
    });
    const clash = siblings.find((row) =>
      windowsOverlap(effectiveFrom, effectiveUntil, row.effectiveFrom, row.effectiveUntil),
    );
    if (clash) {
      throw new ConflictException({
        message:
          "An active price already covers this effective period for this device type",
        code: "PRICE_LIST_OVERLAP",
        existingId: clash.id,
      });
    }
  }

  private assertPositivePrice(unitPrice: number): void {
    if (!(unitPrice > 0) || !Number.isFinite(unitPrice)) {
      throw new BadRequestException({
        message: "unitPrice must be a positive amount",
        code: "INVALID_PRICE",
      });
    }
  }

  async create(
    companyId: string,
    input: PriceListItemCreateInput,
  ): Promise<PriceListItemWithType> {
    await this.assertDeviceTypeExists(input.deviceTypeId);
    this.assertPositivePrice(input.unitPrice);

    const effectiveFrom = toDateOnly(input.effectiveFrom);
    const effectiveUntil =
      input.effectiveUntil != null ? toDateOnly(input.effectiveUntil) : null;
    if (effectiveUntil && effectiveUntil.getTime() < effectiveFrom.getTime()) {
      throw new BadRequestException({
        message: "effectiveUntil cannot be before effectiveFrom",
        code: "INVALID_EFFECTIVE_RANGE",
      });
    }

    await this.assertNoActiveOverlap(
      companyId,
      input.deviceTypeId,
      effectiveFrom,
      effectiveUntil,
    );

    try {
      return await prisma.priceListItem.create({
        data: {
          companyId,
          deviceTypeId: input.deviceTypeId,
          unitPrice: new Prisma.Decimal(input.unitPrice),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          effectiveFrom,
          effectiveUntil,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
        include: { deviceType: { select: deviceTypeSelect } },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException({
          message: "A price with this effective-from date already exists for this device type",
          code: "DUPLICATE_PRICE_LIST_ITEM",
        });
      }
      throw err;
    }
  }

  async findAll(
    companyId: string,
    query: PriceListItemListQuery,
  ): Promise<PriceListItemListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.PriceListItemWhereInput = {
      companyId,
      ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            deviceType: {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { code: { contains: query.search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      PRICE_LIST_ITEM_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "effectiveFrom",
    );

    const [total, data] = await Promise.all([
      prisma.priceListItem.count({ where }),
      prisma.priceListItem.findMany({
        where,
        include: { deviceType: { select: deviceTypeSelect } },
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<PriceListItemWithType> {
    const row = await prisma.priceListItem.findFirst({
      where: { id, companyId },
      include: { deviceType: { select: deviceTypeSelect } },
    });
    if (!row) {
      throw new NotFoundException({
        message: "Price list item not found",
        code: "PRICE_LIST_ITEM_NOT_FOUND",
      });
    }
    return row;
  }

  async update(
    companyId: string,
    id: string,
    input: PriceListItemUpdateInput,
  ): Promise<PriceListItemWithType> {
    const existing = await this.findOne(companyId, id);
    if (input.unitPrice !== undefined) this.assertPositivePrice(input.unitPrice);

    const effectiveFrom =
      input.effectiveFrom !== undefined
        ? toDateOnly(input.effectiveFrom)
        : existing.effectiveFrom;
    const effectiveUntil =
      input.effectiveUntil !== undefined
        ? input.effectiveUntil != null
          ? toDateOnly(input.effectiveUntil)
          : null
        : existing.effectiveUntil;
    if (effectiveUntil && effectiveUntil.getTime() < effectiveFrom.getTime()) {
      throw new BadRequestException({
        message: "effectiveUntil cannot be before effectiveFrom",
        code: "INVALID_EFFECTIVE_RANGE",
      });
    }

    const willBeActive = input.isActive !== undefined ? input.isActive : existing.isActive;
    if (willBeActive) {
      await this.assertNoActiveOverlap(
        companyId,
        existing.deviceTypeId,
        effectiveFrom,
        effectiveUntil,
        id,
      );
    }

    try {
      return await prisma.priceListItem.update({
        where: { id: existing.id },
        data: {
          ...(input.unitPrice !== undefined
            ? { unitPrice: new Prisma.Decimal(input.unitPrice) }
            : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.effectiveFrom !== undefined ? { effectiveFrom } : {}),
          ...(input.effectiveUntil !== undefined ? { effectiveUntil } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: { deviceType: { select: deviceTypeSelect } },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException({
          message: "A price with this effective-from date already exists for this device type",
          code: "DUPLICATE_PRICE_LIST_ITEM",
        });
      }
      throw err;
    }
  }

  async remove(companyId: string, id: string): Promise<PriceListItemWithType> {
    const existing = await this.findOne(companyId, id);
    await prisma.priceListItem.delete({ where: { id: existing.id } });
    return existing;
  }

  async resolve(
    companyId: string,
    deviceTypeId: string,
    date: Date,
  ): Promise<ResolvedPrice | null> {
    return resolveActivePriceListItem(prisma, companyId, deviceTypeId, date);
  }
}
