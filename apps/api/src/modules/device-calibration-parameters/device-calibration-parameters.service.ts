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

export interface DeviceCalibrationParameterCapabilityRef {
  id: string;
  code: string;
  name: string;
}

export interface DeviceCalibrationParameterCapabilityGroup {
  capability: DeviceCalibrationParameterCapabilityRef;
  /** Persisted per-DeviceType order (null when no DeviceTypeCapabilityOrder row yet). */
  sortOrder: number | null;
  count: number;
  parameters: DeviceCalibrationParameterWithRelations[];
}

export interface DeviceCalibrationParameterDeviceTypeGroup {
  deviceType: { id: string; code: string; name: string };
  /** Device category name for the parent row's "Kategori" column (null if unset). */
  categoryName: string | null;
  count: number;
  /**
   * Parameters grouped by Capability, capabilities ordered by their persisted
   * per-DeviceType `sortOrder` (DeviceTypeCapabilityOrder), parameters ordered by
   * their persisted `sortOrder` within each capability.
   */
  capabilities: DeviceCalibrationParameterCapabilityGroup[];
  /** Flattened view of `capabilities` (same order) — kept for backward compatibility. */
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

const ORDER_STEP = 10;
const UNORDERED = Number.MAX_SAFE_INTEGER;

/**
 * Order parameters within a single Capability: by persisted `sortOrder`, then
 * case-insensitively by name as a deterministic tiebreak. Display text is never
 * modified — only the order changes.
 */
function compareParametersWithinCapability(
  a: DeviceCalibrationParameterWithRelations,
  b: DeviceCalibrationParameterWithRelations,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/**
 * Group a device type's parameters by Capability and order both levels:
 * capabilities by their persisted per-DeviceType `sortOrder` (falling back to
 * case-insensitive name when a capability has no order row yet), parameters by
 * `sortOrder` within each capability. Pure — mutates nothing in the DB.
 */
function buildCapabilityGroups(
  parameters: DeviceCalibrationParameterWithRelations[],
  sortOrderByCapabilityId: Map<string, number>,
): DeviceCalibrationParameterCapabilityGroup[] {
  const byCapability = new Map<string, DeviceCalibrationParameterCapabilityGroup>();
  for (const parameter of parameters) {
    const capability = parameter.capabilityItem.capability;
    let group = byCapability.get(capability.id);
    if (!group) {
      const persisted = sortOrderByCapabilityId.get(capability.id);
      group = {
        capability: { id: capability.id, code: capability.code, name: capability.name },
        sortOrder: persisted ?? null,
        count: 0,
        parameters: [],
      };
      byCapability.set(capability.id, group);
    }
    group.parameters.push(parameter);
    group.count += 1;
  }

  const groups = [...byCapability.values()];
  groups.sort((a, b) => {
    const ao = a.sortOrder ?? UNORDERED;
    const bo = b.sortOrder ?? UNORDERED;
    if (ao !== bo) return ao - bo;
    return a.capability.name.localeCompare(b.capability.name, undefined, { sensitivity: "base" });
  });
  for (const group of groups) group.parameters.sort(compareParametersWithinCapability);
  return groups;
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

  /** Resolve the parent DeviceCapability of a DeviceCapabilityItem. */
  private async resolveCapabilityId(
    tx: Prisma.TransactionClient,
    capabilityItemId: string,
  ): Promise<string> {
    const item = await tx.deviceCapabilityItem.findUnique({
      where: { id: capabilityItemId },
      select: { capabilityId: true },
    });
    if (!item) {
      throw new BadRequestException({
        message: "Device capability item not found",
        code: "DEVICE_CAPABILITY_ITEM_NOT_FOUND",
      });
    }
    return item.capabilityId;
  }

  /**
   * Append-to-end ordering for a parameter that has just entered a
   * (deviceTypeId, capability) scope: returns the next parameter `sortOrder`
   * and guarantees a DeviceTypeCapabilityOrder row exists for the capability
   * (also appended to the end of the device type's capability list).
   */
  private async appendToOrderingScope(
    tx: Prisma.TransactionClient,
    deviceTypeId: string,
    capabilityId: string,
    excludeParameterId?: string,
  ): Promise<number> {
    const siblingAgg = await tx.deviceCalibrationParameter.aggregate({
      where: {
        deviceTypeId,
        capabilityItem: { capabilityId },
        ...(excludeParameterId ? { NOT: { id: excludeParameterId } } : {}),
      },
      _max: { sortOrder: true },
    });
    const nextParameterOrder = (siblingAgg._max.sortOrder ?? 0) + ORDER_STEP;

    const existingCapabilityOrder = await tx.deviceTypeCapabilityOrder.findUnique({
      where: { deviceTypeId_capabilityId: { deviceTypeId, capabilityId } },
      select: { id: true },
    });
    if (!existingCapabilityOrder) {
      const capabilityAgg = await tx.deviceTypeCapabilityOrder.aggregate({
        where: { deviceTypeId },
        _max: { sortOrder: true },
      });
      await tx.deviceTypeCapabilityOrder.create({
        data: {
          deviceTypeId,
          capabilityId,
          sortOrder: (capabilityAgg._max.sortOrder ?? 0) + ORDER_STEP,
        },
      });
    }
    return nextParameterOrder;
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
      const capabilityId = await this.resolveCapabilityId(tx, input.capabilityItemId);
      const sortOrder = await this.appendToOrderingScope(
        tx,
        input.deviceTypeId,
        capabilityId,
      );
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
          sortOrder,
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
      orderBy: [{ deviceType: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
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
          capabilities: [],
          parameters: [row],
        });
      }
    }

    const allGroups = [...groups.values()];
    const total = allGroups.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const data = allGroups.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    if (data.length > 0) {
      const pagedTypeIds = data.map((group) => group.deviceType.id);
      const [types, capabilityOrders] = await Promise.all([
        prisma.deviceType.findMany({
          where: { id: { in: pagedTypeIds } },
          select: { id: true, category: { select: { name: true } } },
        }),
        prisma.deviceTypeCapabilityOrder.findMany({
          where: { deviceTypeId: { in: pagedTypeIds } },
          select: { deviceTypeId: true, capabilityId: true, sortOrder: true },
        }),
      ]);

      const categoryByTypeId = new Map(types.map((type) => [type.id, type.category?.name ?? null]));
      const orderByTypeId = new Map<string, Map<string, number>>();
      for (const row of capabilityOrders) {
        let forType = orderByTypeId.get(row.deviceTypeId);
        if (!forType) {
          forType = new Map();
          orderByTypeId.set(row.deviceTypeId, forType);
        }
        forType.set(row.capabilityId, row.sortOrder);
      }

      for (const group of data) {
        group.categoryName = categoryByTypeId.get(group.deviceType.id) ?? null;
        group.capabilities = buildCapabilityGroups(
          group.parameters,
          orderByTypeId.get(group.deviceType.id) ?? new Map(),
        );
        // Keep the flat list in the same (grouped + ordered) sequence.
        group.parameters = group.capabilities.flatMap((cap) => cap.parameters);
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

    // Moving a parameter to a different device type or capability item takes it
    // out of its old ordering scope — re-append it to the end of the new one.
    const scopeChanged =
      nextDeviceTypeId !== existing.deviceTypeId ||
      nextCapabilityItemId !== existing.capabilityItemId;

    // `code` is immutable and system-issued — not accepted by the update schema.
    const baseData: Prisma.DeviceCalibrationParameterUncheckedUpdateInput = {
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
    };

    if (!scopeChanged) {
      return prisma.deviceCalibrationParameter.update({
        where: { id },
        data: baseData,
        include: parameterInclude,
      });
    }

    return prisma.$transaction(async (tx) => {
      await tx.deviceCalibrationParameter.update({ where: { id }, data: baseData });
      const nextCapabilityId = await this.resolveCapabilityId(tx, nextCapabilityItemId);
      const sortOrder = await this.appendToOrderingScope(
        tx,
        nextDeviceTypeId,
        nextCapabilityId,
        id,
      );
      return tx.deviceCalibrationParameter.update({
        where: { id },
        data: { sortOrder },
        include: parameterInclude,
      });
    });
  }

  async remove(id: string): Promise<DeviceCalibrationParameterWithRelations> {
    const existing = await this.findOne(id);
    await prisma.deviceCalibrationParameter.delete({ where: { id: existing.id } });
    // Sibling `sortOrder` gaps are left as-is (deterministic); any now-empty
    // DeviceTypeCapabilityOrder row is harmless and reused if the capability is
    // re-added.
    return existing;
  }

  /** Capability ids currently attached to a device type (via its parameters). */
  private async capabilityIdsForDeviceType(deviceTypeId: string): Promise<Set<string>> {
    const rows = await prisma.deviceCalibrationParameter.findMany({
      where: { deviceTypeId },
      select: { capabilityItem: { select: { capabilityId: true } } },
    });
    return new Set(rows.map((row) => row.capabilityItem.capabilityId));
  }

  private static assertSameSet(provided: string[], actual: Set<string>, code: string): void {
    const providedSet = new Set(provided);
    const sameSize = providedSet.size === provided.length && providedSet.size === actual.size;
    const sameMembers = sameSize && [...actual].every((id) => providedSet.has(id));
    if (!sameMembers) {
      throw new BadRequestException({
        message:
          "The provided id list must contain exactly the items currently in this scope, with no duplicates",
        code,
      });
    }
  }

  /**
   * Persist the per-DeviceType order of its Capabilities. `capabilityIds` must be
   * the full ordered list of the capabilities currently attached to the device
   * type — a set mismatch (unknown id, missing id, id from another device type,
   * or a duplicate) is rejected.
   */
  async reorderCapabilities(
    deviceTypeId: string,
    capabilityIds: string[],
  ): Promise<DeviceCalibrationParameterCapabilityGroup[]> {
    await this.assertDeviceTypeExists(deviceTypeId);
    const actual = await this.capabilityIdsForDeviceType(deviceTypeId);
    DeviceCalibrationParametersService.assertSameSet(
      capabilityIds,
      actual,
      "CAPABILITY_ORDER_MISMATCH",
    );

    await prisma.$transaction(
      capabilityIds.map((capabilityId, index) =>
        prisma.deviceTypeCapabilityOrder.upsert({
          where: { deviceTypeId_capabilityId: { deviceTypeId, capabilityId } },
          create: { deviceTypeId, capabilityId, sortOrder: (index + 1) * ORDER_STEP },
          update: { sortOrder: (index + 1) * ORDER_STEP },
        }),
      ),
    );

    return this.getDeviceTypeCapabilityGroups(deviceTypeId);
  }

  /**
   * Persist the order of the parameters inside one (deviceType, capability)
   * scope. `parameterIds` must be the full ordered list of that scope — a set
   * mismatch (unknown id, id from another capability / device type, or a
   * duplicate) is rejected.
   */
  async reorderParameters(
    deviceTypeId: string,
    capabilityId: string,
    parameterIds: string[],
  ): Promise<DeviceCalibrationParameterWithRelations[]> {
    await this.assertDeviceTypeExists(deviceTypeId);
    const scoped = await prisma.deviceCalibrationParameter.findMany({
      where: { deviceTypeId, capabilityItem: { capabilityId } },
      select: { id: true },
    });
    DeviceCalibrationParametersService.assertSameSet(
      parameterIds,
      new Set(scoped.map((row) => row.id)),
      "PARAMETER_ORDER_MISMATCH",
    );

    await prisma.$transaction(
      parameterIds.map((id, index) =>
        prisma.deviceCalibrationParameter.update({
          where: { id },
          data: { sortOrder: (index + 1) * ORDER_STEP },
        }),
      ),
    );

    return prisma.deviceCalibrationParameter.findMany({
      where: { deviceTypeId, capabilityItem: { capabilityId } },
      include: parameterInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  /** The ordered Capability → Parameters tree for a single device type. */
  async getDeviceTypeCapabilityGroups(
    deviceTypeId: string,
  ): Promise<DeviceCalibrationParameterCapabilityGroup[]> {
    const [rows, capabilityOrders] = await Promise.all([
      prisma.deviceCalibrationParameter.findMany({
        where: { deviceTypeId },
        include: parameterInclude,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.deviceTypeCapabilityOrder.findMany({
        where: { deviceTypeId },
        select: { capabilityId: true, sortOrder: true },
      }),
    ]);
    const sortOrderByCapabilityId = new Map(
      capabilityOrders.map((row) => [row.capabilityId, row.sortOrder] as const),
    );
    return buildCapabilityGroups(rows, sortOrderByCapabilityId);
  }
}
