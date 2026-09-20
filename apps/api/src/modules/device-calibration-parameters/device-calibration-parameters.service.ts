import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MasterCodeService, Prisma, prisma } from "@medcal/db";
import type { CalibrationTestPoint } from "@medcal/db";
import {
  DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS,
  type CalibrationTestPointCreateInput,
  type CalibrationTestPointUpdateInput,
  type DeviceCalibrationParameterCopyInput,
  type DeviceCalibrationParameterCreateInput,
  type DeviceCalibrationParameterListQuery,
  type DeviceCalibrationParameterUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

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

/** One CalibrationTestPoint (Named Measurement Point) row, verbatim schema shape. */
export type CalibrationTestPointRow = CalibrationTestPoint;

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

export interface DeviceCalibrationParameterCopySkippedRow {
  sourceParameterId: string;
  name: string;
}

export interface DeviceCalibrationParameterCopyUnsupportedRow
  extends DeviceCalibrationParameterCopySkippedRow {
  entryStyle: string;
  valueType: string;
}

export interface DeviceCalibrationParameterCopyCreatedRow {
  id: string;
  code: string;
  name: string;
}

export interface DeviceCalibrationParameterCopyResult {
  created: DeviceCalibrationParameterCopyCreatedRow[];
  skippedDuplicateName: DeviceCalibrationParameterCopySkippedRow[];
  skippedUnsupportedEntryStyle: DeviceCalibrationParameterCopyUnsupportedRow[];
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

  private assertToleranceBounds(
    min: number | null | undefined,
    max: number | null | undefined,
  ): void {
    if (min != null && max != null && min > max) {
      throw new BadRequestException({
        message: "toleranceMin must be less than or equal to toleranceMax",
        code: "INVALID_CALIBRATION_TOLERANCE",
      });
    }
  }

  /**
   * Phase 4B (Gap B) — `derivation` is a descriptive note on what a DERIVED
   * value is derived from; attaching it to a non-DERIVED parameter would be
   * dead/misleading metadata. Mirrors `assertDecimalPlacesValidForValueType`
   * (same "field X only makes sense for state Y" shape).
   */
  private assertDerivationValidForEntryStyle(
    derivation: unknown,
    entryStyle: string,
  ): void {
    if (derivation != null && entryStyle !== "DERIVED") {
      throw new BadRequestException({
        message: "derivation only applies to DERIVED-entry-style calibration parameters",
        code: "INVALID_DERIVATION_FOR_ENTRY_STYLE",
      });
    }
  }

  /**
   * Phase 4A (Gap A) — a parameter is either fully declared as one quantity of a
   * logical test, or fully standalone. A half-declared pair would leave the
   * presentation order undefined, so it is rejected here as well as by the DB
   * CHECK constraint (the zod schema catches the single-request case; this
   * catches a PATCH that supplies only one half of the pair).
   */
  private assertLogicalTestPair(
    logicalTestKey: string | null | undefined,
    logicalTestSequence: number | null | undefined,
  ): void {
    const hasKey = logicalTestKey != null;
    const hasSequence = logicalTestSequence != null;
    if (hasKey === hasSequence) return;
    throw new BadRequestException({
      message: "logicalTestKey and logicalTestSequence must be set together",
      code: "INVALID_LOGICAL_TEST_GROUPING",
    });
  }

  /**
   * Two parameters of the same device type may not claim the same position in
   * the same logical test. Enforced by a unique index too; checked here so the
   * caller gets a typed conflict instead of a raw P2002.
   */
  private async assertUniqueLogicalTestSequence(
    deviceTypeId: string,
    logicalTestKey: string | null | undefined,
    logicalTestSequence: number | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (logicalTestKey == null || logicalTestSequence == null) return;
    const duplicate = await prisma.deviceCalibrationParameter.findFirst({
      where: {
        deviceTypeId,
        logicalTestKey,
        logicalTestSequence,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message:
          "Another calibration parameter already occupies this position in this logical test",
        code: "DUPLICATE_LOGICAL_TEST_SEQUENCE",
        existingId: duplicate.id,
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
    this.assertLogicalTestPair(input.logicalTestKey, input.logicalTestSequence);
    // entryStyle is not required in the payload and defaults to DIRECT_REPLICATES.
    this.assertDerivationValidForEntryStyle(
      input.derivation,
      input.entryStyle ?? "DIRECT_REPLICATES",
    );
    await this.assertUniqueName(input.deviceTypeId, input.capabilityItemId, input.name);
    await this.assertUniqueLogicalTestSequence(
      input.deviceTypeId,
      input.logicalTestKey,
      input.logicalTestSequence,
    );

    // `code` is a system-issued, immutable business identifier (DCP-0001).
    return prisma.$transaction(async (tx) => {
      const code = await MasterCodeService.allocate({
        entity: "DEVICE_CALIBRATION_PARAMETER",
        tx,
      });
      const capabilityId = await this.resolveCapabilityId(tx, input.capabilityItemId);
      const sortOrder = await this.appendToOrderingScope(tx, input.deviceTypeId, capabilityId);
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
          logicalTestKey: input.logicalTestKey ?? null,
          logicalTestSequence: input.logicalTestSequence ?? null,
          entryStyle: input.entryStyle ?? "DIRECT_REPLICATES",
          derivation: input.derivation ?? undefined,
          allowsRepeatedReadings: input.allowsRepeatedReadings ?? true,
          sortOrder,
        },
        include: parameterInclude,
      });
    });
  }

  /**
   * Copy a chosen subset of `sourceDeviceTypeId`'s calibration parameters onto
   * `targetDeviceTypeId`. Capability/CapabilityItem are global master data
   * shared across device types (schema.prisma:1290-1323), so a copied row
   * reuses the SAME `capabilityItemId` as its source — no new capability is
   * ever created. `code` is always freshly allocated (never copied — it is
   * system-issued and globally unique, so source/target can never collide on
   * it: schema.prisma:1372 is scoped per deviceTypeId).
   *
   * Rows are skipped (not erroring the whole batch) rather than copied when:
   * - the target already has a parameter with the same name under the same
   *   capability item (`assertUniqueName` scope) — `skippedDuplicateName`.
   * - the source uses a shape the create path can't express yet
   *   (`entryStyle !== DIRECT_REPLICATES` or `valueType !== NUMBER`, e.g.
   *   Pattern B/LOGGER_SUMMARY parameters with CalibrationTestPoint children)
   *   — `skippedUnsupportedEntryStyle`. Copying these silently would produce a
   *   parameter that looks like Pattern A but is missing its test points.
   *
   * Phase 4A: `logicalTestKey` / `logicalTestSequence` are deliberately NOT
   * copied — a copy may carry only part of a logical test, and half a group has
   * no defined presentation order. The copied row lands standalone (both NULL),
   * exactly as every pre-Phase-4A row, and the grouping is re-declared on the
   * target. Same reasoning as the Pattern B skip above: structure that cannot be
   * carried in full is not carried at all.
   */
  async copy(input: DeviceCalibrationParameterCopyInput): Promise<DeviceCalibrationParameterCopyResult> {
    await this.assertDeviceTypeExists(input.sourceDeviceTypeId);
    await this.assertDeviceTypeExists(input.targetDeviceTypeId);

    const requestedIds = new Set(input.parameterIds);
    const sourceParameters = await prisma.deviceCalibrationParameter.findMany({
      where: { id: { in: [...requestedIds] }, deviceTypeId: input.sourceDeviceTypeId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const foundIds = new Set(sourceParameters.map((row) => row.id));
    const missingIds = [...requestedIds].filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException({
        message: "Some parameterIds do not belong to sourceDeviceTypeId",
        code: "DEVICE_CALIBRATION_PARAMETER_COPY_INVALID_SOURCE",
        parameterIds: missingIds,
      });
    }

    const created: DeviceCalibrationParameterCopyCreatedRow[] = [];
    const skippedDuplicateName: DeviceCalibrationParameterCopySkippedRow[] = [];
    const skippedUnsupportedEntryStyle: DeviceCalibrationParameterCopyUnsupportedRow[] = [];

    await prisma.$transaction(async (tx) => {
      for (const source of sourceParameters) {
        if (source.entryStyle !== "DIRECT_REPLICATES" || source.valueType !== "NUMBER") {
          skippedUnsupportedEntryStyle.push({
            sourceParameterId: source.id,
            name: source.name,
            entryStyle: source.entryStyle,
            valueType: source.valueType,
          });
          continue;
        }

        const duplicate = await tx.deviceCalibrationParameter.findFirst({
          where: {
            deviceTypeId: input.targetDeviceTypeId,
            capabilityItemId: source.capabilityItemId,
            name: { equals: source.name, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (duplicate) {
          skippedDuplicateName.push({ sourceParameterId: source.id, name: source.name });
          continue;
        }

        const code = await MasterCodeService.allocate({
          entity: "DEVICE_CALIBRATION_PARAMETER",
          tx,
        });
        const capabilityId = await this.resolveCapabilityId(tx, source.capabilityItemId);
        const sortOrder = await this.appendToOrderingScope(tx, input.targetDeviceTypeId, capabilityId);
        const createdRow = await tx.deviceCalibrationParameter.create({
          data: {
            deviceTypeId: input.targetDeviceTypeId,
            capabilityItemId: source.capabilityItemId,
            code,
            name: source.name,
            description: source.description,
            uomId: source.uomId,
            toleranceMin: source.toleranceMin,
            toleranceMax: source.toleranceMax,
            toleranceNote: source.toleranceNote,
            decimalPlaces: source.decimalPlaces,
            isActive: true,
            sortOrder,
          },
          select: { id: true, code: true, name: true },
        });
        created.push(createdRow);
      }
    });

    return { created, skippedDuplicateName, skippedUnsupportedEntryStyle };
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
        orderBy: withIdTieBreaker(sortField, sortDir),
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
    if (
      input.capabilityItemId !== undefined &&
      input.capabilityItemId !== existing.capabilityItemId
    ) {
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

    // Validate the MERGED row: a PATCH may supply only one half of the pair.
    const nextLogicalTestKey =
      input.logicalTestKey !== undefined ? input.logicalTestKey : existing.logicalTestKey;
    const nextLogicalTestSequence =
      input.logicalTestSequence !== undefined
        ? input.logicalTestSequence
        : existing.logicalTestSequence;
    this.assertLogicalTestPair(nextLogicalTestKey, nextLogicalTestSequence);
    if (
      input.logicalTestKey !== undefined ||
      input.logicalTestSequence !== undefined ||
      nextDeviceTypeId !== existing.deviceTypeId
    ) {
      await this.assertUniqueLogicalTestSequence(
        nextDeviceTypeId,
        nextLogicalTestKey,
        nextLogicalTestSequence,
        id,
      );
    }

    // Phase 4B (Gap B) — validate the MERGED row: a PATCH may change entryStyle
    // without touching derivation, or vice versa.
    const nextEntryStyle = input.entryStyle !== undefined ? input.entryStyle : existing.entryStyle;
    const nextDerivation = input.derivation !== undefined ? input.derivation : existing.derivation;
    this.assertDerivationValidForEntryStyle(nextDerivation, nextEntryStyle);

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
      ...(input.logicalTestKey !== undefined ? { logicalTestKey: input.logicalTestKey } : {}),
      ...(input.logicalTestSequence !== undefined
        ? { logicalTestSequence: input.logicalTestSequence }
        : {}),
      ...(input.entryStyle !== undefined ? { entryStyle: input.entryStyle } : {}),
      ...(input.derivation !== undefined
        ? { derivation: input.derivation === null ? Prisma.DbNull : input.derivation }
        : {}),
      ...(input.allowsRepeatedReadings !== undefined
        ? { allowsRepeatedReadings: input.allowsRepeatedReadings }
        : {}),
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

  // ── CalibrationTestPoint (Named Measurement Points) ────────────────────────
  //
  // Master/catalog rows nested under one DeviceCalibrationParameter — the same
  // "reads for future jobs, historical jobs use their own JobCalibrationTestPoint
  // snapshot" split already implemented by start()/copyActiveTestPointsIntoJobSnapshot.
  // This Portal surface only ever touches the master row; it never reads or
  // writes JobCalibrationTestPoint or MeasurementResult.
  //
  // No physical delete is exposed — isActive is the only lifecycle mechanism
  // (see schema.prisma CalibrationTestPoint.isActive and measurement-tolerance.ts /
  // job-calibration-test-point-snapshot.ts, which already treat isActive as the
  // sole "counts for future jobs" gate).

  private async assertUniqueTestPointLabel(
    deviceCalibrationParameterId: string,
    settingLabel: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await prisma.calibrationTestPoint.findFirst({
      where: {
        deviceCalibrationParameterId,
        settingLabel: { equals: settingLabel, mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "A test point with this label already exists for this calibration parameter",
        code: "DUPLICATE_CALIBRATION_TEST_POINT_LABEL",
        existingId: duplicate.id,
      });
    }
  }

  private async assertSequenceAvailable(
    deviceCalibrationParameterId: string,
    sequence: number,
  ): Promise<void> {
    const duplicate = await prisma.calibrationTestPoint.findFirst({
      where: { deviceCalibrationParameterId, sequence },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message: "Another test point already occupies this sequence for this calibration parameter",
        code: "DUPLICATE_CALIBRATION_TEST_POINT_SEQUENCE",
        existingId: duplicate.id,
      });
    }
  }

  /** All test points (active AND inactive) for one parameter — Portal management list. */
  async findTestPoints(deviceCalibrationParameterId: string): Promise<CalibrationTestPointRow[]> {
    await this.findOne(deviceCalibrationParameterId);
    return prisma.calibrationTestPoint.findMany({
      where: { deviceCalibrationParameterId },
      orderBy: { sequence: "asc" },
    });
  }

  async createTestPoint(
    deviceCalibrationParameterId: string,
    input: CalibrationTestPointCreateInput,
  ): Promise<CalibrationTestPointRow> {
    await this.findOne(deviceCalibrationParameterId);
    await this.assertUniqueTestPointLabel(deviceCalibrationParameterId, input.settingLabel);

    let sequence = input.sequence;
    if (sequence !== undefined) {
      await this.assertSequenceAvailable(deviceCalibrationParameterId, sequence);
    } else {
      // Append-to-end, mirroring appendToOrderingScope's max+step convention —
      // but +1, not +ORDER_STEP: `sequence` is the 1-based worksheet/LK display
      // number (schema.prisma comment), read directly by the generic PDF and
      // job-start snapshot, unlike the purely internal `sortOrder`.
      const agg = await prisma.calibrationTestPoint.aggregate({
        where: { deviceCalibrationParameterId },
        _max: { sequence: true },
      });
      sequence = (agg._max.sequence ?? 0) + 1;
    }

    return prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId,
        settingLabel: input.settingLabel,
        settingValue: input.settingValue ?? null,
        sequence,
        toleranceMin: input.toleranceMin ?? null,
        toleranceMax: input.toleranceMax ?? null,
        toleranceNote: input.toleranceNote ?? null,
      },
    });
  }

  /** Ownership-scoped lookup — 404 for both "does not exist" and "belongs to another parameter". */
  private async findTestPoint(
    deviceCalibrationParameterId: string,
    testPointId: string,
  ): Promise<CalibrationTestPointRow> {
    await this.findOne(deviceCalibrationParameterId);
    const testPoint = await prisma.calibrationTestPoint.findFirst({
      where: { id: testPointId, deviceCalibrationParameterId },
    });
    if (!testPoint) {
      throw new NotFoundException({
        message: "Calibration test point not found",
        code: "CALIBRATION_TEST_POINT_NOT_FOUND",
      });
    }
    return testPoint;
  }

  async updateTestPoint(
    deviceCalibrationParameterId: string,
    testPointId: string,
    input: CalibrationTestPointUpdateInput,
  ): Promise<CalibrationTestPointRow> {
    const existing = await this.findTestPoint(deviceCalibrationParameterId, testPointId);

    if (input.settingLabel !== undefined && input.settingLabel !== existing.settingLabel) {
      await this.assertUniqueTestPointLabel(
        deviceCalibrationParameterId,
        input.settingLabel,
        testPointId,
      );
    }

    return prisma.calibrationTestPoint.update({
      where: { id: testPointId },
      data: {
        ...(input.settingLabel !== undefined ? { settingLabel: input.settingLabel } : {}),
        ...(input.settingValue !== undefined ? { settingValue: input.settingValue } : {}),
        ...(input.toleranceMin !== undefined ? { toleranceMin: input.toleranceMin } : {}),
        ...(input.toleranceMax !== undefined ? { toleranceMax: input.toleranceMax } : {}),
        ...(input.toleranceNote !== undefined ? { toleranceNote: input.toleranceNote } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  /**
   * Persist the full display order of a parameter's test points. `testPointIds`
   * must be the complete set currently owned by the parameter (active AND
   * inactive) — a mismatch (unknown id, id from another parameter, duplicate,
   * or a missing existing id) is rejected, same convention as
   * reorderParameters/reorderCapabilities above.
   *
   * `sequence` is written in two passes inside one transaction: every row first
   * moves to a temporary value far outside the real 1..N range, then to its
   * final 1-based position. A single-pass rewrite could transiently collide
   * with the `(deviceCalibrationParameterId, sequence)` unique constraint on
   * whichever row hasn't been updated yet (e.g. swapping #1 and #2 head-on).
   */
  async reorderTestPoints(
    deviceCalibrationParameterId: string,
    testPointIds: string[],
  ): Promise<CalibrationTestPointRow[]> {
    await this.findOne(deviceCalibrationParameterId);
    const scoped = await prisma.calibrationTestPoint.findMany({
      where: { deviceCalibrationParameterId },
      select: { id: true },
    });
    DeviceCalibrationParametersService.assertSameSet(
      testPointIds,
      new Set(scoped.map((row) => row.id)),
      "CALIBRATION_TEST_POINT_ORDER_MISMATCH",
    );

    const TEMP_SEQUENCE_OFFSET = 1_000_000;
    await prisma.$transaction([
      ...testPointIds.map((id, index) =>
        prisma.calibrationTestPoint.update({
          where: { id },
          data: { sequence: TEMP_SEQUENCE_OFFSET + index + 1 },
        }),
      ),
      ...testPointIds.map((id, index) =>
        prisma.calibrationTestPoint.update({
          where: { id },
          data: { sequence: index + 1 },
        }),
      ),
    ]);

    return prisma.calibrationTestPoint.findMany({
      where: { deviceCalibrationParameterId },
      orderBy: { sequence: "asc" },
    });
  }
}
