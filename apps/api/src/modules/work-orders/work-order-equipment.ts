import { BadRequestException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { WorkOrderEquipmentItemInput } from "@medcal/shared";
import { resolveCalibrationValidity } from "../equipment-calibration-records/calibration-validity";

/**
 * WorkOrder ↔ actual reference-equipment ("Equipment yang akan dibawa").
 *
 * DeviceTypeEquipmentRequirement is the DEFAULT/template layer. This module
 * derives the default proposal from it and validates the ACTUAL Equipment units
 * a planner picks for a specific ON_SITE WorkOrder. The persisted selection
 * lives in WorkOrderEquipment and belongs to the WorkOrder, independent of the
 * template and of any future EquipmentDeliveryNote.
 *
 * ON_SITE only — SEND_TO_LAB WorkOrders never carry equipment-to-bring.
 */

export const WORK_ORDER_EQUIPMENT_ORDER_STEP = 10;

/** Base client or a transaction client — only these delegates are used here. */
type Db = Pick<typeof prisma, "deviceTypeEquipmentRequirement" | "equipment">;

/** Minimal shape of the DeviceType chain carried on a WorkOrder item. */
export interface WorkOrderItemDeviceTypeSource {
  purchaseOrderItem: {
    quotationItem: {
      requestItem: { deviceTypeId: string } | null;
    };
  };
}

export interface ProposedEquipmentType {
  equipmentType: { id: string; code: string; name: string; category: string | null };
  /** Proposal ordering position (multiples of 10). */
  sortOrder: number;
  /** DeviceType whose requirement first contributed this EquipmentType. */
  coveredFromDeviceTypeId: string;
}

export interface EquipmentCandidate {
  id: string;
  code: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  equipmentTypeId: string;
  calibrationStatus: "VALID" | "EXPIRED" | "NOT_YET_VALID" | "NO_RECORD";
  validUntil: Date | null;
}

export interface EquipmentProposalRow {
  equipmentType: ProposedEquipmentType["equipmentType"];
  sortOrder: number;
  coveredFromDeviceTypeId: string;
  candidates: EquipmentCandidate[];
  /** Already-persisted selection for this type on the WorkOrder, if any. */
  selectedEquipmentId: string | null;
}

/** Distinct DeviceType ids represented by a WorkOrder's calibration items. */
export function deviceTypeIdsFromItems(items: WorkOrderItemDeviceTypeSource[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    const deviceTypeId = item.purchaseOrderItem.quotationItem.requestItem?.deviceTypeId;
    if (deviceTypeId) ids.add(deviceTypeId);
  }
  return [...ids];
}

/**
 * Deduplicated, deterministically ordered list of the EquipmentTypes required to
 * calibrate the given DeviceTypes, per DeviceTypeEquipmentRequirement.
 *
 * Ordering (never modifies DeviceTypeEquipmentRequirement.sortOrder):
 *   1. walk DeviceTypes by name asc  (matches the requirements module's primary sort)
 *   2. within each, walk its requirements by (sortOrder asc, equipmentType.name asc)
 *   3. dedupe by equipmentTypeId keeping the FIRST occurrence
 *   4. assign proposal sortOrder 10, 20, 30, … in that final walk order
 */
export async function resolveRequiredEquipmentTypes(
  db: Db,
  deviceTypeIds: string[],
): Promise<ProposedEquipmentType[]> {
  if (deviceTypeIds.length === 0) return [];

  const requirements = await db.deviceTypeEquipmentRequirement.findMany({
    where: { deviceTypeId: { in: deviceTypeIds } },
    include: {
      equipmentType: { select: { id: true, code: true, name: true, category: true } },
    },
    orderBy: [
      { deviceType: { name: "asc" } },
      { sortOrder: "asc" },
      { equipmentType: { name: "asc" } },
    ],
  });

  const seen = new Set<string>();
  const proposed: ProposedEquipmentType[] = [];
  for (const requirement of requirements) {
    if (seen.has(requirement.equipmentTypeId)) continue;
    seen.add(requirement.equipmentTypeId);
    proposed.push({
      equipmentType: requirement.equipmentType,
      sortOrder: (proposed.length + 1) * WORK_ORDER_EQUIPMENT_ORDER_STEP,
      coveredFromDeviceTypeId: requirement.deviceTypeId,
    });
  }
  return proposed;
}

/** Active Equipment units of the given types, with derived calibration status. */
export async function loadEquipmentCandidates(
  db: Db,
  companyId: string,
  equipmentTypeIds: string[],
  asOf: Date,
): Promise<Map<string, EquipmentCandidate[]>> {
  const byType = new Map<string, EquipmentCandidate[]>();
  if (equipmentTypeIds.length === 0) return byType;

  const units = await db.equipment.findMany({
    where: { companyId, isActive: true, equipmentTypeId: { in: equipmentTypeIds } },
    include: {
      calibrationRecords: {
        select: { id: true, status: true, calibrationDate: true, validFrom: true, validUntil: true },
      },
    },
    orderBy: { code: "asc" },
  });

  for (const unit of units) {
    const validity = resolveCalibrationValidity(unit.calibrationRecords, asOf);
    const candidate: EquipmentCandidate = {
      id: unit.id,
      code: unit.code,
      brand: unit.brand,
      model: unit.model,
      serialNumber: unit.serialNumber,
      equipmentTypeId: unit.equipmentTypeId,
      calibrationStatus: validity.status,
      validUntil: validity.validUntil,
    };
    const list = byType.get(unit.equipmentTypeId);
    if (list) list.push(candidate);
    else byType.set(unit.equipmentTypeId, [candidate]);
  }
  return byType;
}

export interface ValidatedEquipmentRow {
  equipmentId: string;
  equipmentTypeId: string;
  notes: string | null;
  sortOrder: number;
}

export interface EquipmentValidationResult {
  rows: ValidatedEquipmentRow[];
  /** Non-blocking advisories (e.g. calibration expired at the scheduled date). */
  warnings: Array<{ code: string; equipmentId: string; message: string }>;
}

/**
 * Validate a full-set equipment selection for an ON_SITE WorkOrder.
 * Blocking rules (throw BadRequestException):
 *   - no duplicate equipmentId in the payload
 *   - each Equipment exists in this company
 *   - each Equipment isActive
 *   - the row's equipmentTypeId matches the Equipment's own equipmentTypeId
 * Non-blocking (returned as warnings):
 *   - Equipment calibration is not VALID at `scheduledStart` (recommended default)
 */
export async function validateEquipmentSelection(
  db: Db,
  companyId: string,
  items: WorkOrderEquipmentItemInput[],
  scheduledStart: Date | null,
): Promise<EquipmentValidationResult> {
  const ids = items.map((item) => item.equipmentId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException({
      message: "The same equipment unit appears more than once in the selection",
      code: "DUPLICATE_WORK_ORDER_EQUIPMENT",
    });
  }

  const asOf = scheduledStart ?? new Date();
  const units = ids.length
    ? await db.equipment.findMany({
        where: { id: { in: ids }, companyId },
        include: {
          calibrationRecords: {
            select: {
              id: true,
              status: true,
              calibrationDate: true,
              validFrom: true,
              validUntil: true,
            },
          },
        },
      })
    : [];
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  const warnings: EquipmentValidationResult["warnings"] = [];
  const rows: ValidatedEquipmentRow[] = items.map((item, index) => {
    const unit = unitById.get(item.equipmentId);
    if (!unit) {
      throw new BadRequestException({
        message: "Selected equipment unit was not found for this company",
        code: "EQUIPMENT_NOT_FOUND",
        equipmentId: item.equipmentId,
      });
    }
    if (!unit.isActive) {
      throw new BadRequestException({
        message: "Selected equipment unit is inactive",
        code: "EQUIPMENT_INACTIVE",
        equipmentId: item.equipmentId,
      });
    }
    if (unit.equipmentTypeId !== item.equipmentTypeId) {
      throw new BadRequestException({
        message: "Selected equipment unit does not match the required equipment type",
        code: "EQUIPMENT_TYPE_MISMATCH",
        equipmentId: item.equipmentId,
      });
    }

    const validity = resolveCalibrationValidity(unit.calibrationRecords, asOf);
    if (validity.status !== "VALID") {
      warnings.push({
        code: "EQUIPMENT_CALIBRATION_NOT_VALID",
        equipmentId: unit.id,
        message: `Equipment ${unit.code} calibration status is ${validity.status} at the scheduled date`,
      });
    }

    return {
      equipmentId: item.equipmentId,
      equipmentTypeId: item.equipmentTypeId,
      notes: item.notes?.trim() ? item.notes.trim() : null,
      sortOrder: (index + 1) * WORK_ORDER_EQUIPMENT_ORDER_STEP,
    };
  });

  return { rows, warnings };
}
