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
  type DeviceTypeAliasListQuery,
  type DeviceTypeAliasUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

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
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
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

  async update(
    id: string,
    input: DeviceTypeAliasUpdateInput,
  ): Promise<DeviceTypeAliasWithType> {
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
