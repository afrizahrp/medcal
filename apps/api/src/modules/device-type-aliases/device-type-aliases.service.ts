import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import {
  DEVICE_TYPE_ALIAS_SORTABLE_FIELDS,
  normalizeDeviceTerm,
  type DeviceTypeAliasCreateInput,
  type DeviceTypeAliasGroupedQuery,
  type DeviceTypeAliasListQuery,
  type DeviceTypeAliasUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = { id: true, code: true, name: true } as const;

export type DeviceTypeAliasWithType = Prisma.DeviceTypeAliasGetPayload<{
  include: { deviceType: { select: typeof deviceTypeSelect } };
}>;

export interface DeviceTypeAliasListResult {
  data: DeviceTypeAliasWithType[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DeviceTypeAliasDeviceTypeGroup {
  deviceType: { id: string; code: string; name: string };
  /** Device category name for the parent row's "Kategori" column (null if unset). */
  categoryName: string | null;
  count: number;
  aliases: DeviceTypeAliasWithType[];
}

export interface DeviceTypeAliasGroupedResult {
  data: DeviceTypeAliasDeviceTypeGroup[];
  /** Standard MEDCAL pagination fields — paginated at the Device-Type level. */
  page: number;
  pageSize: number;
  /** Total number of Device-Type groups (what the page count is derived from). */
  total: number;
  totalPages: number;
  /** Totals across the whole (search-filtered) result, not just this page. */
  totalAliases: number;
  totalDeviceTypes: number;
}

@Injectable()
export class DeviceTypeAliasesService {
  private async assertDeviceTypeExists(deviceTypeId: string): Promise<void> {
    const deviceType = await prisma.deviceType.findUnique({ where: { id: deviceTypeId } });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
  }

  private async assertNormalizedAliasFree(
    normalizedAlias: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await prisma.deviceTypeAlias.findUnique({
      where: { normalizedAlias },
      include: { deviceType: { select: deviceTypeSelect } },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException({
        message: `Alias "${existing.alias}" already maps to device type ${existing.deviceType.name}`,
        code: "DUPLICATE_ALIAS",
        existingId: existing.id,
        deviceTypeId: existing.deviceTypeId,
      });
    }
  }

  async create(input: DeviceTypeAliasCreateInput): Promise<DeviceTypeAliasWithType> {
    await this.assertDeviceTypeExists(input.deviceTypeId);

    const alias = input.alias.trim();
    const normalizedAlias = normalizeDeviceTerm(alias);
    if (!normalizedAlias) {
      throw new BadRequestException({
        message: "Alias cannot be blank after normalization",
        code: "INVALID_ALIAS",
      });
    }
    await this.assertNormalizedAliasFree(normalizedAlias);

    return prisma.deviceTypeAlias.create({
      data: {
        deviceTypeId: input.deviceTypeId,
        alias,
        normalizedAlias,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { deviceType: { select: deviceTypeSelect } },
    });
  }

  async findAll(query: DeviceTypeAliasListQuery): Promise<DeviceTypeAliasListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceTypeAliasWhereInput = {
      ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { alias: { contains: query.search, mode: "insensitive" } },
              { deviceType: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      DEVICE_TYPE_ALIAS_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.deviceTypeAlias.count({ where }),
      prisma.deviceTypeAlias.findMany({
        where,
        include: { deviceType: { select: deviceTypeSelect } },
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /**
   * Collapsible browse view: aliases grouped under their Device Type, paginated
   * at the Device-Type level so a Device Type and all of its aliases always stay
   * together on one page. Mirrors DeviceCalibrationParametersService
   * .findAllGroupedByDeviceType. Only Device Types that have at least one alias
   * appear. Ordering is a presentation concern only — no data is mutated.
   */
  async findAllGroupedByDeviceType(
    query: DeviceTypeAliasGroupedQuery = {},
  ): Promise<DeviceTypeAliasGroupedResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = query.search?.trim() || undefined;

    const rows = await prisma.deviceTypeAlias.findMany({
      where: search
        ? {
            OR: [
              { alias: { contains: search, mode: "insensitive" } },
              { deviceType: { name: { contains: search, mode: "insensitive" } } },
              { deviceType: { code: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
      include: { deviceType: { select: deviceTypeSelect } },
      orderBy: [{ deviceType: { name: "asc" } }, { alias: "asc" }],
    });

    const groups = new Map<string, DeviceTypeAliasDeviceTypeGroup>();
    for (const row of rows) {
      const existing = groups.get(row.deviceType.id);
      if (existing) {
        existing.aliases.push(row);
        existing.count += 1;
      } else {
        groups.set(row.deviceType.id, {
          deviceType: row.deviceType,
          categoryName: null,
          count: 1,
          aliases: [row],
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
      totalAliases: rows.length,
      totalDeviceTypes: total,
    };
  }

  async findOne(id: string): Promise<DeviceTypeAliasWithType> {
    const alias = await prisma.deviceTypeAlias.findUnique({
      where: { id },
      include: { deviceType: { select: deviceTypeSelect } },
    });
    if (!alias) {
      throw new NotFoundException({
        message: "Device type alias not found",
        code: "DEVICE_TYPE_ALIAS_NOT_FOUND",
      });
    }
    return alias;
  }

  async update(id: string, input: DeviceTypeAliasUpdateInput): Promise<DeviceTypeAliasWithType> {
    const existing = await this.findOne(id);

    if (input.deviceTypeId !== undefined && input.deviceTypeId !== existing.deviceTypeId) {
      await this.assertDeviceTypeExists(input.deviceTypeId);
    }

    let alias = existing.alias;
    let normalizedAlias = existing.normalizedAlias;
    if (input.alias !== undefined) {
      alias = input.alias.trim();
      normalizedAlias = normalizeDeviceTerm(alias);
      if (!normalizedAlias) {
        throw new BadRequestException({
          message: "Alias cannot be blank after normalization",
          code: "INVALID_ALIAS",
        });
      }
      if (normalizedAlias !== existing.normalizedAlias) {
        await this.assertNormalizedAliasFree(normalizedAlias, id);
      }
    }

    return prisma.deviceTypeAlias.update({
      where: { id },
      data: {
        ...(input.deviceTypeId !== undefined ? { deviceTypeId: input.deviceTypeId } : {}),
        ...(input.alias !== undefined ? { alias, normalizedAlias } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { deviceType: { select: deviceTypeSelect } },
    });
  }

  async remove(id: string): Promise<DeviceTypeAliasWithType> {
    const existing = await this.findOne(id);
    await prisma.deviceTypeAlias.delete({ where: { id: existing.id } });
    return existing;
  }
}
