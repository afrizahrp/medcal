import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { DeviceCapability, DeviceCapabilityItem, Prisma } from "@medcal/db";
import {
  DEVICE_CAPABILITY_SORTABLE_FIELDS,
  type DeviceCapabilityCreateInput,
  type DeviceCapabilityItemCreateInput,
  type DeviceCapabilityItemUpdateInput,
  type DeviceCapabilityListQuery,
  type DeviceCapabilityUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const itemOrderBy = { code: "asc" as const };

export type DeviceCapabilityListRow = DeviceCapability & {
  itemCount: number;
};

export type DeviceCapabilityWithItems = DeviceCapability & {
  items: DeviceCapabilityItem[];
};

export type DeviceCapabilityItemRow = DeviceCapabilityItem;

export interface DeviceCapabilityListResult {
  data: DeviceCapabilityListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class DeviceCapabilitiesService {
  private async assertUniqueCapabilityCode(code: string, excludeId?: string): Promise<void> {
    const duplicate = await prisma.deviceCapability.findFirst({
      where: {
        code,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "A device capability with this code already exists",
        code: "DUPLICATE_DEVICE_CAPABILITY_CODE",
        existingId: duplicate.id,
      });
    }
  }

  private async assertUniqueItemCode(
    capabilityId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await prisma.deviceCapabilityItem.findFirst({
      where: {
        capabilityId,
        code,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "A capability item with this code already exists for this capability",
        code: "DUPLICATE_DEVICE_CAPABILITY_ITEM_CODE",
        existingId: duplicate.id,
      });
    }
  }

  async create(input: DeviceCapabilityCreateInput): Promise<DeviceCapabilityWithItems> {
    await this.assertUniqueCapabilityCode(input.code);

    return prisma.deviceCapability.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
      },
      include: { items: { orderBy: itemOrderBy } },
    });
  }

  async findAll(query: DeviceCapabilityListQuery): Promise<DeviceCapabilityListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceCapabilityWhereInput = {
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
      DEVICE_CAPABILITY_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, rows] = await Promise.all([
      prisma.deviceCapability.count({ where }),
      prisma.deviceCapability.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data: DeviceCapabilityListRow[] = rows.map((row) => {
      const { _count, ...rest } = row;
      return { ...rest, itemCount: _count.items };
    });

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string): Promise<DeviceCapabilityWithItems> {
    const capability = await prisma.deviceCapability.findUnique({
      where: { id },
      include: { items: { orderBy: itemOrderBy } },
    });
    if (!capability) {
      throw new NotFoundException({
        message: "Device capability not found",
        code: "DEVICE_CAPABILITY_NOT_FOUND",
      });
    }
    return capability;
  }

  async update(id: string, input: DeviceCapabilityUpdateInput): Promise<DeviceCapabilityWithItems> {
    const existing = await this.findOne(id);

    if (input.code !== undefined && input.code !== existing.code) {
      await this.assertUniqueCapabilityCode(input.code, id);
    }

    return prisma.deviceCapability.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: { items: { orderBy: itemOrderBy } },
    });
  }

  async remove(id: string): Promise<DeviceCapabilityWithItems> {
    const existing = await this.findOne(id);
    const itemCount = await prisma.deviceCapabilityItem.count({ where: { capabilityId: id } });
    if (itemCount > 0) {
      throw new BadRequestException({
        message: "Cannot delete a device capability that still has items",
        code: "DEVICE_CAPABILITY_HAS_ITEMS",
      });
    }
    await prisma.deviceCapability.delete({ where: { id: existing.id } });
    return existing;
  }

  async findItems(capabilityId: string): Promise<DeviceCapabilityItemRow[]> {
    await this.findOne(capabilityId);
    return prisma.deviceCapabilityItem.findMany({
      where: { capabilityId },
      orderBy: itemOrderBy,
    });
  }

  async createItem(
    capabilityId: string,
    input: DeviceCapabilityItemCreateInput,
  ): Promise<DeviceCapabilityItemRow> {
    await this.findOne(capabilityId);
    await this.assertUniqueItemCode(capabilityId, input.code);

    return prisma.deviceCapabilityItem.create({
      data: {
        capabilityId,
        code: input.code,
        name: input.name,
        description: input.description,
      },
    });
  }

  async updateItem(
    capabilityId: string,
    itemId: string,
    input: DeviceCapabilityItemUpdateInput,
  ): Promise<DeviceCapabilityItemRow> {
    const existing = await this.findItem(capabilityId, itemId);

    if (input.code !== undefined && input.code !== existing.code) {
      await this.assertUniqueItemCode(capabilityId, input.code, itemId);
    }

    return prisma.deviceCapabilityItem.update({
      where: { id: itemId },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
  }

  async removeItem(capabilityId: string, itemId: string): Promise<DeviceCapabilityItemRow> {
    const existing = await this.findItem(capabilityId, itemId);
    await prisma.deviceCapabilityItem.delete({ where: { id: existing.id } });
    return existing;
  }

  private async findItem(capabilityId: string, itemId: string): Promise<DeviceCapabilityItemRow> {
    await this.findOne(capabilityId);
    const item = await prisma.deviceCapabilityItem.findFirst({
      where: { id: itemId, capabilityId },
    });
    if (!item) {
      throw new NotFoundException({
        message: "Device capability item not found",
        code: "DEVICE_CAPABILITY_ITEM_NOT_FOUND",
      });
    }
    return item;
  }
}
