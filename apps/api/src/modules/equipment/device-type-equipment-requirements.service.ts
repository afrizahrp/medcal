import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import type {
  DeviceTypeEquipmentRequirementCreateInput,
  DeviceTypeEquipmentRequirementUpdateInput,
} from "@medcal/shared";

const DEFAULT_PAGE_SIZE = 10;

const equipmentTypeSelect = {
  id: true,
  code: true,
  name: true,
  category: true,
  isActive: true,
} as const;

const deviceTypeSelect = { id: true, code: true, name: true } as const;

const requirementInclude = {
  deviceType: { select: deviceTypeSelect },
  equipmentType: { select: equipmentTypeSelect },
} as const;

export type DeviceTypeEquipmentRequirementWithRelations =
  Prisma.DeviceTypeEquipmentRequirementGetPayload<{
    include: {
      deviceType: { select: { id: true; code: true; name: true } };
      equipmentType: {
        select: { id: true; code: true; name: true; category: true; isActive: true };
      };
    };
  }>;

export interface DeviceTypeEquipmentRequirementGroup {
  deviceType: { id: string; code: string; name: string };
  categoryName: string | null;
  count: number;
  requirements: DeviceTypeEquipmentRequirementWithRelations[];
}

export interface DeviceTypeEquipmentRequirementGroupedResult {
  data: DeviceTypeEquipmentRequirementGroup[];
  page: number;
  pageSize: number;
  /** Total number of Device-Type groups (drives the page count). */
  total: number;
  totalPages: number;
  totalRequirements: number;
  totalDeviceTypes: number;
}

function buildSearchWhere(
  search: string | undefined,
): Prisma.DeviceTypeEquipmentRequirementWhereInput {
  if (!search) return {};
  return {
    OR: [
      { notes: { contains: search, mode: "insensitive" } },
      { deviceType: { name: { contains: search, mode: "insensitive" } } },
      { deviceType: { code: { contains: search, mode: "insensitive" } } },
      { equipmentType: { name: { contains: search, mode: "insensitive" } } },
      { equipmentType: { code: { contains: search, mode: "insensitive" } } },
      { equipmentType: { category: { contains: search, mode: "insensitive" } } },
    ],
  };
}

@Injectable()
export class DeviceTypeEquipmentRequirementsService {
  private async assertDeviceTypeExists(deviceTypeId: string): Promise<void> {
    const deviceType = await prisma.deviceType.findUnique({ where: { id: deviceTypeId } });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
  }

  private async assertEquipmentTypeExists(equipmentTypeId: string): Promise<void> {
    const equipmentType = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
    if (!equipmentType) {
      throw new BadRequestException({
        message: "Equipment type not found",
        code: "EQUIPMENT_TYPE_NOT_FOUND",
      });
    }
  }

  async create(
    input: DeviceTypeEquipmentRequirementCreateInput,
  ): Promise<DeviceTypeEquipmentRequirementWithRelations> {
    await this.assertDeviceTypeExists(input.deviceTypeId);
    await this.assertEquipmentTypeExists(input.equipmentTypeId);

    const duplicate = await prisma.deviceTypeEquipmentRequirement.findUnique({
      where: {
        deviceTypeId_equipmentTypeId: {
          deviceTypeId: input.deviceTypeId,
          equipmentTypeId: input.equipmentTypeId,
        },
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "This equipment type is already required for this device type",
        code: "DUPLICATE_EQUIPMENT_REQUIREMENT",
        existingId: duplicate.id,
      });
    }

    return prisma.deviceTypeEquipmentRequirement.create({
      data: {
        deviceTypeId: input.deviceTypeId,
        equipmentTypeId: input.equipmentTypeId,
        notes: input.notes,
      },
      include: requirementInclude,
    });
  }

  async findOne(id: string): Promise<DeviceTypeEquipmentRequirementWithRelations> {
    const requirement = await prisma.deviceTypeEquipmentRequirement.findUnique({
      where: { id },
      include: requirementInclude,
    });
    if (!requirement) {
      throw new NotFoundException({
        message: "Equipment requirement not found",
        code: "EQUIPMENT_REQUIREMENT_NOT_FOUND",
      });
    }
    return requirement;
  }

  async update(
    id: string,
    input: DeviceTypeEquipmentRequirementUpdateInput,
  ): Promise<DeviceTypeEquipmentRequirementWithRelations> {
    await this.findOne(id);
    return prisma.deviceTypeEquipmentRequirement.update({
      where: { id },
      data: {
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: requirementInclude,
    });
  }

  async remove(id: string): Promise<DeviceTypeEquipmentRequirementWithRelations> {
    const existing = await this.findOne(id);
    await prisma.deviceTypeEquipmentRequirement.delete({ where: { id } });
    return existing;
  }

  /** Flat list (optionally filtered by deviceTypeId), for the create-form dropdown side. */
  async findAll(query: {
    deviceTypeId?: string;
    equipmentTypeId?: string;
  }): Promise<DeviceTypeEquipmentRequirementWithRelations[]> {
    return prisma.deviceTypeEquipmentRequirement.findMany({
      where: {
        ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
        ...(query.equipmentTypeId ? { equipmentTypeId: query.equipmentTypeId } : {}),
      },
      include: requirementInclude,
      orderBy: [{ deviceType: { name: "asc" } }, { equipmentType: { name: "asc" } }],
    });
  }

  async findAllGroupedByDeviceType(
    query: { search?: string; page?: number; pageSize?: number } = {},
  ): Promise<DeviceTypeEquipmentRequirementGroupedResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    // Fetch every matching requirement, group by Device Type, then paginate the
    // groups — a Device Type and all its requirements always stay on one page.
    const rows = await prisma.deviceTypeEquipmentRequirement.findMany({
      where: buildSearchWhere(query.search?.trim() || undefined),
      include: requirementInclude,
      orderBy: [{ deviceType: { name: "asc" } }, { equipmentType: { name: "asc" } }],
    });

    const groups = new Map<string, DeviceTypeEquipmentRequirementGroup>();
    for (const row of rows) {
      const existing = groups.get(row.deviceType.id);
      if (existing) {
        existing.requirements.push(row);
        existing.count += 1;
      } else {
        groups.set(row.deviceType.id, {
          deviceType: row.deviceType,
          categoryName: null,
          count: 1,
          requirements: [row],
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
      totalRequirements: rows.length,
      totalDeviceTypes: total,
    };
  }
}
