import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import {
  DEVICE_PHYSICAL_CHECK_ITEM_SORTABLE_FIELDS,
  type DevicePhysicalCheckItemCreateInput,
  type DevicePhysicalCheckItemGroupedQuery,
  type DevicePhysicalCheckItemListQuery,
  type DevicePhysicalCheckItemUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;
const ORDER_STEP = 10;

const deviceTypeSelect = { id: true, code: true, name: true } as const;

const itemInclude = {
  deviceType: { select: deviceTypeSelect },
} as const;

export type DevicePhysicalCheckItemWithRelations = Prisma.DevicePhysicalCheckItemGetPayload<{
  include: { deviceType: { select: { id: true; code: true; name: true } } };
}>;

export interface DevicePhysicalCheckItemListResult {
  data: DevicePhysicalCheckItemWithRelations[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DevicePhysicalCheckItemDeviceTypeGroup {
  deviceType: { id: string; code: string; name: string };
  /** Device category name for the parent row's "Kategori" column (null if unset). */
  categoryName: string | null;
  count: number;
  /** Items ordered by persisted `sortOrder`, then name. */
  items: DevicePhysicalCheckItemWithRelations[];
}

export interface DevicePhysicalCheckItemGroupedResult {
  data: DevicePhysicalCheckItemDeviceTypeGroup[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalItems: number;
  totalDeviceTypes: number;
}

function buildSearchWhere(search: string | undefined): Prisma.DevicePhysicalCheckItemWhereInput {
  if (!search) return {};
  return {
    OR: [
      { code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { inspectionLimit: { contains: search, mode: "insensitive" } },
      { deviceType: { name: { contains: search, mode: "insensitive" } } },
      { deviceType: { code: { contains: search, mode: "insensitive" } } },
    ],
  };
}

/**
 * Next deterministic code for a DeviceType: `${deviceTypeCode}_PHYSICAL_NNN`.
 * Matches the Physical Inspection master seed convention. Does not rename
 * existing rows; only allocates the next free numeric suffix for new creates.
 */
function nextPhysicalCheckItemCode(deviceTypeCode: string, existingCodes: string[]): string {
  const prefix = `${deviceTypeCode}_PHYSICAL_`;
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (/^\d+$/.test(suffix)) {
      max = Math.max(max, Number(suffix));
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

@Injectable()
export class DevicePhysicalCheckItemsService {
  private async assertDeviceTypeExists(
    deviceTypeId: string,
  ): Promise<{ id: string; code: string }> {
    const deviceType = await prisma.deviceType.findUnique({
      where: { id: deviceTypeId },
      select: { id: true, code: true },
    });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
    return deviceType;
  }

  async create(
    input: DevicePhysicalCheckItemCreateInput,
  ): Promise<DevicePhysicalCheckItemWithRelations> {
    const deviceType = await this.assertDeviceTypeExists(input.deviceTypeId);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.devicePhysicalCheckItem.findMany({
        where: { deviceTypeId: deviceType.id },
        select: { code: true, sortOrder: true },
      });
      const code = nextPhysicalCheckItemCode(
        deviceType.code,
        existing.map((row) => row.code),
      );
      const duplicate = existing.some((row) => row.code === code);
      if (duplicate) {
        throw new ConflictException({
          message: "A physical check item with this code already exists for this device type",
          code: "DUPLICATE_DEVICE_PHYSICAL_CHECK_ITEM_CODE",
        });
      }
      const maxSort = existing.reduce((acc, row) => Math.max(acc, row.sortOrder), 0);
      const sortOrder = maxSort + ORDER_STEP;

      try {
        return await tx.devicePhysicalCheckItem.create({
          data: {
            deviceTypeId: deviceType.id,
            code,
            name: input.name,
            inspectionLimit: input.inspectionLimit,
            sortOrder,
            isActive: input.isActive ?? true,
          },
          include: itemInclude,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictException({
            message: "A physical check item with this code already exists for this device type",
            code: "DUPLICATE_DEVICE_PHYSICAL_CHECK_ITEM_CODE",
          });
        }
        throw error;
      }
    });
  }

  async findAll(query: DevicePhysicalCheckItemListQuery): Promise<DevicePhysicalCheckItemListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DevicePhysicalCheckItemWhereInput = {
      ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...buildSearchWhere(query.search),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      DEVICE_PHYSICAL_CHECK_ITEM_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "sortOrder",
    );

    const [total, data] = await Promise.all([
      prisma.devicePhysicalCheckItem.count({ where }),
      prisma.devicePhysicalCheckItem.findMany({
        where,
        include: itemInclude,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findAllGroupedByDeviceType(
    query: DevicePhysicalCheckItemGroupedQuery = {},
  ): Promise<DevicePhysicalCheckItemGroupedResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const rows = await prisma.devicePhysicalCheckItem.findMany({
      where: {
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...buildSearchWhere(query.search?.trim() || undefined),
      },
      include: itemInclude,
      orderBy: [{ deviceType: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    });

    const groups = new Map<string, DevicePhysicalCheckItemDeviceTypeGroup>();
    for (const row of rows) {
      const existing = groups.get(row.deviceType.id);
      if (existing) {
        existing.items.push(row);
        existing.count += 1;
      } else {
        groups.set(row.deviceType.id, {
          deviceType: row.deviceType,
          categoryName: null,
          count: 1,
          items: [row],
        });
      }
    }

    const allGroups = [...groups.values()];
    const total = allGroups.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const data = allGroups.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    if (data.length > 0) {
      const types = await prisma.deviceType.findMany({
        where: { id: { in: data.map((group) => group.deviceType.id) } },
        select: { id: true, category: { select: { name: true } } },
      });
      const categoryByTypeId = new Map(types.map((type) => [type.id, type.category?.name ?? null]));
      for (const group of data) {
        group.categoryName = categoryByTypeId.get(group.deviceType.id) ?? null;
      }
    }

    return {
      data,
      page,
      pageSize,
      total,
      totalPages,
      totalItems: rows.length,
      totalDeviceTypes: total,
    };
  }

  async findOne(id: string): Promise<DevicePhysicalCheckItemWithRelations> {
    const item = await prisma.devicePhysicalCheckItem.findUnique({
      where: { id },
      include: itemInclude,
    });
    if (!item) {
      throw new NotFoundException({
        message: "Device physical check item not found",
        code: "DEVICE_PHYSICAL_CHECK_ITEM_NOT_FOUND",
      });
    }
    return item;
  }

  async update(
    id: string,
    input: DevicePhysicalCheckItemUpdateInput,
  ): Promise<DevicePhysicalCheckItemWithRelations> {
    await this.findOne(id);

    // deviceTypeId and code are intentionally immutable — v1 ownership lock.
    return prisma.devicePhysicalCheckItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.inspectionLimit !== undefined ? { inspectionLimit: input.inspectionLimit } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: itemInclude,
    });
  }

  async remove(id: string): Promise<DevicePhysicalCheckItemWithRelations> {
    const existing = await this.findOne(id);
    const resultCount = await prisma.physicalCheckResult.count({
      where: { devicePhysicalCheckItemId: existing.id },
    });
    if (resultCount > 0) {
      throw new BadRequestException({
        message:
          "Cannot delete a physical check item that is referenced by historical results; deactivate it instead",
        code: "DEVICE_PHYSICAL_CHECK_ITEM_IN_USE",
      });
    }
    await prisma.devicePhysicalCheckItem.delete({ where: { id: existing.id } });
    return existing;
  }

  private static assertSameSet(provided: string[], actual: Set<string>): void {
    const providedSet = new Set(provided);
    const sameSize = providedSet.size === provided.length && providedSet.size === actual.size;
    const sameMembers = sameSize && [...actual].every((id) => providedSet.has(id));
    if (!sameMembers) {
      throw new BadRequestException({
        message:
          "itemIds must contain exactly the physical check items currently attached to this device type, with no duplicates",
        code: "DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH",
      });
    }
  }

  /**
   * Persist item order within one DeviceType. `itemIds` must be the full ordered
   * list for that device type — set mismatch is rejected. Written as multiples of 10.
   */
  async reorder(
    deviceTypeId: string,
    itemIds: string[],
  ): Promise<DevicePhysicalCheckItemWithRelations[]> {
    await this.assertDeviceTypeExists(deviceTypeId);

    const scoped = await prisma.devicePhysicalCheckItem.findMany({
      where: { deviceTypeId },
      select: { id: true },
    });
    DevicePhysicalCheckItemsService.assertSameSet(
      itemIds,
      new Set(scoped.map((row) => row.id)),
    );

    await prisma.$transaction(
      itemIds.map((id, index) =>
        prisma.devicePhysicalCheckItem.update({
          where: { id },
          data: { sortOrder: (index + 1) * ORDER_STEP },
        }),
      ),
    );

    return prisma.devicePhysicalCheckItem.findMany({
      where: { deviceTypeId },
      include: itemInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }
}
