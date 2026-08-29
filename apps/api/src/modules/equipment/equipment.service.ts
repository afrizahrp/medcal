import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  EQUIPMENT_SORTABLE_FIELDS,
  type EquipmentCreateInput,
  type EquipmentListQuery,
  type EquipmentUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const equipmentTypeSelect = { id: true, code: true, name: true, category: true } as const;

const equipmentInclude = {
  equipmentType: { select: equipmentTypeSelect },
} as const;

export type EquipmentWithRelations = Prisma.EquipmentGetPayload<{
  include: typeof equipmentInclude;
}>;

export interface EquipmentListResult {
  data: EquipmentWithRelations[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

@Injectable()
export class EquipmentService {
  private async assertEquipmentTypeExists(equipmentTypeId: string): Promise<void> {
    const equipmentType = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
    if (!equipmentType) {
      throw new BadRequestException({
        message: "Equipment type not found",
        code: "EQUIPMENT_TYPE_NOT_FOUND",
      });
    }
  }

  private async assertUniqueCode(
    companyId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await prisma.equipment.findFirst({
      where: { companyId, code, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "An equipment unit with this code already exists for this company",
        code: "DUPLICATE_EQUIPMENT_CODE",
        existingId: duplicate.id,
      });
    }
  }

  async create(companyId: string, input: EquipmentCreateInput): Promise<EquipmentWithRelations> {
    await this.assertEquipmentTypeExists(input.equipmentTypeId);
    const code = input.code.trim();
    await this.assertUniqueCode(companyId, code);

    return prisma.equipment.create({
      data: {
        companyId,
        equipmentTypeId: input.equipmentTypeId,
        code,
        brand: emptyToNull(input.brand) ?? undefined,
        model: emptyToNull(input.model) ?? undefined,
        serialNumber: emptyToNull(input.serialNumber) ?? undefined,
        notes: emptyToNull(input.notes) ?? undefined,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: equipmentInclude,
    });
  }

  async findAll(companyId: string, query: EquipmentListQuery): Promise<EquipmentListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.EquipmentWhereInput = {
      companyId,
      ...(query.equipmentTypeId ? { equipmentTypeId: query.equipmentTypeId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { brand: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
              { serialNumber: { contains: query.search, mode: "insensitive" } },
              { equipmentType: { name: { contains: query.search, mode: "insensitive" } } },
              { equipmentType: { code: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      EQUIPMENT_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.equipment.count({ where }),
      prisma.equipment.findMany({
        where,
        include: equipmentInclude,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<EquipmentWithRelations> {
    const equipment = await prisma.equipment.findFirst({
      where: { id, companyId },
      include: equipmentInclude,
    });
    if (!equipment) {
      throw new NotFoundException({
        message: "Equipment not found",
        code: "EQUIPMENT_NOT_FOUND",
      });
    }
    return equipment;
  }

  async update(
    companyId: string,
    id: string,
    input: EquipmentUpdateInput,
  ): Promise<EquipmentWithRelations> {
    const existing = await this.findOne(companyId, id);

    if (input.equipmentTypeId !== undefined && input.equipmentTypeId !== existing.equipmentTypeId) {
      await this.assertEquipmentTypeExists(input.equipmentTypeId);
    }

    if (input.code !== undefined && input.code.trim() !== existing.code) {
      await this.assertUniqueCode(companyId, input.code.trim(), id);
    }

    return prisma.equipment.update({
      where: { id: existing.id },
      data: {
        ...(input.equipmentTypeId !== undefined ? { equipmentTypeId: input.equipmentTypeId } : {}),
        ...(input.code !== undefined ? { code: input.code.trim() } : {}),
        ...(input.brand !== undefined ? { brand: emptyToNull(input.brand) } : {}),
        ...(input.model !== undefined ? { model: emptyToNull(input.model) } : {}),
        ...(input.serialNumber !== undefined
          ? { serialNumber: emptyToNull(input.serialNumber) }
          : {}),
        ...(input.notes !== undefined ? { notes: emptyToNull(input.notes) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: equipmentInclude,
    });
  }

  async remove(companyId: string, id: string): Promise<EquipmentWithRelations> {
    const existing = await this.findOne(companyId, id);
    // Phase 2A: Equipment has no downstream references yet (JobReferenceEquipmentUsed
    // link, WorkOrderEquipment, EquipmentCalibrationRecord are all future). A plain
    // delete is safe; prefer isActive=false for soft-retire in the UI.
    await prisma.equipment.delete({ where: { id: existing.id } });
    return existing;
  }
}
