import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MasterCodeService, prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS,
  type DeviceCalibrationParameterCreateInput,
  type DeviceCalibrationParameterListQuery,
  type DeviceCalibrationParameterUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = { id: true, code: true, name: true } as const;

const capabilityItemInclude = {
  id: true,
  name: true,
  capabilityId: true,
  capability: { select: { id: true, code: true, name: true } },
} as const;

const uomSelect = { id: true, code: true, name: true, symbol: true } as const;

const parameterInclude = {
  deviceType: { select: deviceTypeSelect },
  capabilityItem: { select: capabilityItemInclude },
  uom: { select: uomSelect },
} as const;

export type DeviceCalibrationParameterWithRelations = Prisma.DeviceCalibrationParameterGetPayload<{
  include: {
    deviceType: { select: { id: true; code: true; name: true } };
    capabilityItem: {
      select: {
        id: true;
        name: true;
        capabilityId: true;
        capability: { select: { id: true; code: true; name: true } };
      };
    };
    uom: { select: { id: true; code: true; name: true; symbol: true } };
  };
}>;

export interface DeviceCalibrationParameterListResult {
  data: DeviceCalibrationParameterWithRelations[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DeviceCalibrationParameterDeviceTypeGroup {
  deviceType: { id: string; code: string; name: string };
  /** Device category name for the parent row's "Kategori" column (null if unset). */
  categoryName: string | null;
  count: number;
  parameters: DeviceCalibrationParameterWithRelations[];
}

export interface DeviceCalibrationParameterGroupedResult {
  data: DeviceCalibrationParameterDeviceTypeGroup[];
  /** Standard MEDCAL pagination fields — paginated at the Device-Type level. */
  page: number;
  pageSize: number;
  /** Total number of Device-Type groups (what the page count is derived from). */
  total: number;
  totalPages: number;
  /** Totals across the whole (search-filtered) result, not just this page. */
  totalParameters: number;
  totalDeviceTypes: number;
}

/**
 * Presentation ordering for the grouped view: parameters are grouped by their
 * Capability, then sorted by Parameter name within each Capability. Capability
 * has no dedicated ordering field on its master model, so a deterministic,
 * case-insensitive ascending order by Capability name is used as the fallback.
 * Comparison is case-insensitive; original display text is never modified.
 */
function compareGroupedParameters(
  a: DeviceCalibrationParameterWithRelations,
  b: DeviceCalibrationParameterWithRelations,
): number {
  const byCapability = a.capabilityItem.capability.name.localeCompare(
    b.capabilityItem.capability.name,
    undefined,
    { sensitivity: "base" },
  );
  if (byCapability !== 0) return byCapability;
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  // Stable tiebreaker so equal names keep a deterministic order.
  return a.id.localeCompare(b.id);
}

function buildSearchWhere(search: string | undefined): Prisma.DeviceCalibrationParameterWhereInput {
  if (!search) return {};
  return {
    OR: [
      { code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { deviceType: { name: { contains: search, mode: "insensitive" } } },
      { deviceType: { code: { contains: search, mode: "insensitive" } } },
      { capabilityItem: { name: { contains: search, mode: "insensitive" } } },
      { capabilityItem: { capability: { name: { contains: search, mode: "insensitive" } } } },
      { capabilityItem: { capability: { code: { contains: search, mode: "insensitive" } } } },
      { uom: { name: { contains: search, mode: "insensitive" } } },
      { uom: { code: { contains: search, mode: "insensitive" } } },
      { uom: { symbol: { contains: search, mode: "insensitive" } } },
      { toleranceNote: { contains: search, mode: "insensitive" } },
    ],
  };
}

@Injectable()
export class DeviceCalibrationParametersService {
  private async assertDeviceTypeExists(deviceTypeId: string): Promise<void> {
    const deviceType = await prisma.deviceType.findUnique({ where: { id: deviceTypeId } });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
  }

  private async assertCapabilityItemExists(capabilityItemId: string): Promise<void> {
    const item = await prisma.deviceCapabilityItem.findUnique({ where: { id: capabilityItemId } });
    if (!item) {
      throw new BadRequestException({
        message: "Device capability item not found",
        code: "DEVICE_CAPABILITY_ITEM_NOT_FOUND",
      });
    }
  }

  private async assertUomExists(uomId: string): Promise<void> {
    const uom = await prisma.uom.findUnique({ where: { id: uomId } });
    if (!uom) {
      throw new BadRequestException({
        message: "UOM not found",
        code: "UOM_NOT_FOUND",
      });
    }
  }

  private assertDecimalPlacesValidForValueType(
    decimalPlaces: number | null | undefined,
    valueType: string,
  ): void {
    if (decimalPlaces != null && valueType !== "NUMBER") {
      throw new BadRequestException({
        message: "decimalPlaces only applies to NUMBER-type calibration parameters",
        code: "INVALID_DECIMAL_PLACES_FOR_VALUE_TYPE",
      });
    }
  }

  private assertToleranceBounds(min: number | null | undefined, max: number | null | undefined): void {
    if (min != null && max != null && min > max) {
      throw new BadRequestException({
        message: "toleranceMin must be less than or equal to toleranceMax",
        code: "INVALID_CALIBRATION_TOLERANCE",
      });
    }
  }

  /**
   * `code` is now system-issued and globally unique, so the composite
   * (deviceTypeId, capabilityItemId, code) constraint can never collide. The
   * meaningful "no duplicate parameter" rule is preserved here on `name`.
   */
  private async assertUniqueName(
    deviceTypeId: string,
    capabilityItemId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await prisma.deviceCalibrationParameter.findFirst({
      where: {
        deviceTypeId,
        capabilityItemId,
        name: { equals: name, mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException({
        message:
          "A calibration parameter with this name already exists for this device type and capability item",
        code: "DUPLICATE_DEVICE_CALIBRATION_PARAMETER_NAME",
        existingId: duplicate.id,
      });
    }
  }

  async create(
    input: DeviceCalibrationParameterCreateInput,
  ): Promise<DeviceCalibrationParameterWithRelations> {
    await this.assertDeviceTypeExists(input.deviceTypeId);
    await this.assertCapabilityItemExists(input.capabilityItemId);
    await this.assertUomExists(input.uomId);
    this.assertToleranceBounds(input.toleranceMin, input.toleranceMax);
    // valueType is not settable via the API and defaults to NUMBER at the DB level.
    this.assertDecimalPlacesValidForValueType(input.decimalPlaces, "NUMBER");
    await this.assertUniqueName(input.deviceTypeId, input.capabilityItemId, input.name);

    // `code` is a system-issued, immutable business identifier (DCP-0001).
    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({
        entity: "DEVICE_CALIBRATION_PARAMETER",
        tx,
      });
      return tx.deviceCalibrationParameter.create({
        data: {
          deviceTypeId: input.deviceTypeId,
          capabilityItemId: input.capabilityItemId,
          code,
          name: input.name,
          description: input.description,
          uomId: input.uomId,
          toleranceMin: input.toleranceMin ?? null,
          toleranceMax: input.toleranceMax ?? null,
          toleranceNote: input.toleranceNote ?? null,
          decimalPlaces: input.decimalPlaces ?? null,
        },
        include: parameterInclude,
      });
    });
  }

  async findAll(
    query: DeviceCalibrationParameterListQuery,
  ): Promise<DeviceCalibrationParameterListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceCalibrationParameterWhereInput = {
      ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
      ...(query.capabilityItemId ? { capabilityItemId: query.capabilityItemId } : {}),
      ...(query.capabilityId ? { capabilityItem: { capabilityId: query.capabilityId } } : {}),
      ...(query.uomId ? { uomId: query.uomId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...buildSearchWhere(query.search),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.deviceCalibrationParameter.count({ where }),
      prisma.deviceCalibrationParameter.findMany({
        where,
        include: parameterInclude,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findAllGroupedByDeviceType(
    query: { search?: string; page?: number; pageSize?: number; isActive?: boolean } = {},
  ): Promise<DeviceCalibrationParameterGroupedResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    // Fetch every matching parameter (ordered) so grouping is correct, then
    // paginate at the Device-Type level — a Device Type and all of its
    // parameters always stay together on one page.
    const rows = await prisma.deviceCalibrationParameter.findMany({
      where: {
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...buildSearchWhere(query.search?.trim() || undefined),
      },
      include: parameterInclude,
      orderBy: [{ deviceType: { name: "asc" } }, { name: "asc" }],
    });

    const groups = new Map<string, DeviceCalibrationParameterDeviceTypeGroup>();
    for (const row of rows) {
      const existing = groups.get(row.deviceType.id);
      if (existing) {
        existing.parameters.push(row);
        existing.count += 1;
      } else {
        groups.set(row.deviceType.id, {
          deviceType: row.deviceType,
          categoryName: null,
          count: 1,
          parameters: [row],
        });
      }
    }

    // Group by Capability, then sort by Parameter name within each Capability.
    // Ordering is a presentation concern only — no data is mutated.
    for (const group of groups.values()) {
      group.parameters.sort(compareGroupedParameters);
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
      totalParameters: rows.length,
      totalDeviceTypes: total,
    };
  }

  async findOne(id: string): Promise<DeviceCalibrationParameterWithRelations> {
    const parameter = await prisma.deviceCalibrationParameter.findUnique({
      where: { id },
      include: parameterInclude,
    });
    if (!parameter) {
      throw new NotFoundException({
        message: "Device calibration parameter not found",
        code: "DEVICE_CALIBRATION_PARAMETER_NOT_FOUND",
      });
    }
    return parameter;
  }

  async update(
    id: string,
    input: DeviceCalibrationParameterUpdateInput,
  ): Promise<DeviceCalibrationParameterWithRelations> {
    const existing = await this.findOne(id);

    const nextDeviceTypeId = input.deviceTypeId ?? existing.deviceTypeId;
    const nextCapabilityItemId = input.capabilityItemId ?? existing.capabilityItemId;
    const nextName = input.name ?? existing.name;

    if (input.deviceTypeId !== undefined && input.deviceTypeId !== existing.deviceTypeId) {
      await this.assertDeviceTypeExists(input.deviceTypeId);
    }
    if (input.capabilityItemId !== undefined && input.capabilityItemId !== existing.capabilityItemId) {
      await this.assertCapabilityItemExists(input.capabilityItemId);
    }
    if (input.uomId !== undefined && input.uomId !== existing.uomId) {
      await this.assertUomExists(input.uomId);
    }

    const nextMin =
      input.toleranceMin !== undefined
        ? (input.toleranceMin ?? null)
        : existing.toleranceMin == null
          ? null
          : Number(existing.toleranceMin);
    const nextMax =
      input.toleranceMax !== undefined
        ? (input.toleranceMax ?? null)
        : existing.toleranceMax == null
          ? null
          : Number(existing.toleranceMax);
    this.assertToleranceBounds(nextMin, nextMax);

    if (input.decimalPlaces !== undefined) {
      this.assertDecimalPlacesValidForValueType(input.decimalPlaces, existing.valueType);
    }

    const uniqueChanged =
      nextDeviceTypeId !== existing.deviceTypeId ||
      nextCapabilityItemId !== existing.capabilityItemId ||
      nextName.toLowerCase() !== existing.name.toLowerCase();

    if (uniqueChanged) {
      await this.assertUniqueName(nextDeviceTypeId, nextCapabilityItemId, nextName, id);
    }

    // `code` is immutable and system-issued — not accepted by the update schema.
    return prisma.deviceCalibrationParameter.update({
      where: { id },
      data: {
        ...(input.deviceTypeId !== undefined ? { deviceTypeId: input.deviceTypeId } : {}),
        ...(input.capabilityItemId !== undefined ? { capabilityItemId: input.capabilityItemId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.uomId !== undefined ? { uomId: input.uomId } : {}),
        ...(input.toleranceMin !== undefined ? { toleranceMin: input.toleranceMin } : {}),
        ...(input.toleranceMax !== undefined ? { toleranceMax: input.toleranceMax } : {}),
        ...(input.toleranceNote !== undefined ? { toleranceNote: input.toleranceNote } : {}),
        ...(input.decimalPlaces !== undefined ? { decimalPlaces: input.decimalPlaces } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: parameterInclude,
    });
  }

  async remove(id: string): Promise<DeviceCalibrationParameterWithRelations> {
    const existing = await this.findOne(id);
    await prisma.deviceCalibrationParameter.delete({ where: { id: existing.id } });
    return existing;
  }
}
