import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { JobReferenceEquipmentReplaceInput } from "@medcal/shared";
import {
  resolveCalibrationValidity,
  type CalibrationValidityRecord,
  type CalibrationValidityStatus,
} from "../equipment-calibration-records/calibration-validity";
import { resolveRequiredEquipmentTypes } from "../work-orders/work-order-equipment";

/**
 * JobReferenceEquipmentUsed ↔ CalibrationJob. Candidates are drawn ONLY from
 * the job's WorkOrder's already-confirmed WorkOrderEquipment list — there is
 * no fresh company-wide Equipment search at the job level.
 */

export const jobReferenceEquipmentSourceInclude = {
  calibrationRequestItem: { select: { deviceTypeId: true } },
  purchaseOrderItem: {
    select: {
      quotationItem: {
        select: { requestItem: { select: { deviceTypeId: true } } },
      },
    },
  },
  workOrder: {
    select: {
      id: true,
      equipment: {
        select: {
          equipmentId: true,
          equipment: {
            select: {
              id: true,
              code: true,
              brand: true,
              model: true,
              serialNumber: true,
              isActive: true,
              equipmentTypeId: true,
              equipmentType: { select: { id: true, code: true, name: true } },
              calibrationRecords: {
                select: {
                  id: true,
                  status: true,
                  calibrationDate: true,
                  validFrom: true,
                  validUntil: true,
                  acceptedForUse: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type JobReferenceEquipmentSource = Prisma.CalibrationJobGetPayload<{
  include: typeof jobReferenceEquipmentSourceInclude;
}>;

type SourceEquipment = JobReferenceEquipmentSource["workOrder"]["equipment"][number]["equipment"];

export const jobReferenceEquipmentUsedInclude = {
  equipment: {
    select: {
      id: true,
      code: true,
      brand: true,
      model: true,
      serialNumber: true,
      equipmentType: { select: { id: true, code: true, name: true } },
    },
  },
  equipmentCalibrationRecord: {
    select: { id: true, calibrationDate: true, validFrom: true, validUntil: true, certificateNumber: true },
  },
  overriddenBy: { select: { id: true, name: true } },
} as const;

export type JobReferenceEquipmentUsedDetail = Prisma.JobReferenceEquipmentUsedGetPayload<{
  include: typeof jobReferenceEquipmentUsedInclude;
}>;

interface JobDeviceTypeSource {
  calibrationRequestItem: { deviceTypeId: string } | null;
  purchaseOrderItem: {
    quotationItem: { requestItem: { deviceTypeId: string } | null } | null;
  } | null;
}

/** Same resolution order as CalibrationJobsService.resolveJobDeviceTypeId, for this narrower select shape. */
function resolveDeviceTypeId(job: JobDeviceTypeSource): string | null {
  return (
    job.calibrationRequestItem?.deviceTypeId ??
    job.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
    null
  );
}

export type JobEquipmentValidityStatus = CalibrationValidityStatus | "NOT_ACCEPTED_FOR_USE";

export interface JobEquipmentValidityResult {
  status: JobEquipmentValidityStatus;
  recordId: string | null;
  validUntil: Date | null;
}

type AcceptanceAwareRecord = CalibrationValidityRecord & { acceptedForUse: boolean };

/**
 * Layers the acceptedForUse requirement on top of resolveCalibrationValidity
 * without modifying it — VALID is downgraded to NOT_ACCEPTED_FOR_USE when the
 * applicable record hasn't been accepted for use. WorkOrderEquipment's own
 * (looser) validity check is untouched by this.
 */
export function resolveJobEquipmentValidity(
  records: AcceptanceAwareRecord[],
  asOf: Date,
): JobEquipmentValidityResult {
  const base = resolveCalibrationValidity(records, asOf);
  if (base.status !== "VALID") return base;
  const applicable = records.find((record) => record.id === base.recordId);
  if (!applicable?.acceptedForUse) {
    return { status: "NOT_ACCEPTED_FOR_USE", recordId: base.recordId, validUntil: base.validUntil };
  }
  return base;
}

async function requiredEquipmentTypeIds(job: JobDeviceTypeSource): Promise<Set<string> | null> {
  const deviceTypeId = resolveDeviceTypeId(job);
  if (!deviceTypeId) return null;
  const required = await resolveRequiredEquipmentTypes(prisma, [deviceTypeId]);
  return new Set(required.map((row) => row.equipmentType.id));
}

export interface JobReferenceEquipmentCandidate {
  equipmentId: string;
  code: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  equipmentTypeId: string;
  equipmentTypeName: string;
  isActive: boolean;
  validity: JobEquipmentValidityResult;
  requiredForDeviceType: boolean;
}

/** Precomputed candidates for the picker — sourced solely from the job's WorkOrder's confirmed equipment. */
export async function buildReferenceEquipmentCandidates(
  job: JobReferenceEquipmentSource,
  asOf: Date,
): Promise<JobReferenceEquipmentCandidate[]> {
  const requiredTypeIds = await requiredEquipmentTypeIds(job);

  return job.workOrder.equipment.map(({ equipment: unit }) => ({
    equipmentId: unit.id,
    code: unit.code,
    brand: unit.brand,
    model: unit.model,
    serialNumber: unit.serialNumber,
    equipmentTypeId: unit.equipmentTypeId,
    equipmentTypeName: unit.equipmentType.name,
    isActive: unit.isActive,
    validity: resolveJobEquipmentValidity(unit.calibrationRecords, asOf),
    requiredForDeviceType: requiredTypeIds?.has(unit.equipmentTypeId) ?? false,
  }));
}

export interface ValidatedJobReferenceEquipmentRow {
  equipmentId: string;
  equipmentCalibrationRecordId: string | null;
  validityOverridden: boolean;
  overrideReason: string | null;
}

/**
 * Validate a full-set reference-equipment selection for a CalibrationJob.
 * Blocking rules (throw BadRequestException):
 *   - no duplicate equipmentId in the payload
 *   - each equipmentId is on the job's WorkOrder's confirmed WorkOrderEquipment list
 *   - the unit is isActive
 *   - the unit's type is one of the job's required EquipmentTypes (skipped, not
 *     failed, when the job's DeviceType cannot be resolved)
 *   - calibration validity — VALID required unless the item carries an
 *     override AND the caller holds overrideReferenceEquipmentValidity
 *     (ForbiddenException otherwise)
 */
export async function validateJobReferenceEquipmentSelection(
  job: JobReferenceEquipmentSource,
  items: JobReferenceEquipmentReplaceInput["items"],
  asOf: Date,
  canOverride: boolean,
): Promise<ValidatedJobReferenceEquipmentRow[]> {
  const ids = items.map((item) => item.equipmentId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException({
      message: "The same equipment unit appears more than once in the selection",
      code: "DUPLICATE_JOB_REFERENCE_EQUIPMENT",
    });
  }

  const requiredTypeIds = await requiredEquipmentTypeIds(job);
  const onWorkOrder = new Map<string, SourceEquipment>(
    job.workOrder.equipment.map((row) => [row.equipmentId, row.equipment]),
  );

  return items.map((item) => {
    const unit = onWorkOrder.get(item.equipmentId);
    if (!unit) {
      throw new BadRequestException({
        message: "Equipment is not confirmed on this job's work order",
        code: "EQUIPMENT_NOT_CONFIRMED_ON_WORK_ORDER",
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
    if (requiredTypeIds && !requiredTypeIds.has(unit.equipmentTypeId)) {
      throw new BadRequestException({
        message: "Selected equipment's type is not required for this job's device type",
        code: "EQUIPMENT_TYPE_NOT_REQUIRED_FOR_DEVICE",
        equipmentId: item.equipmentId,
      });
    }

    const validity = resolveJobEquipmentValidity(unit.calibrationRecords, asOf);
    const isValid = validity.status === "VALID";
    if (!isValid && !item.override) {
      throw new BadRequestException({
        message: `Equipment calibration is not valid (${validity.status})`,
        code: "EQUIPMENT_CALIBRATION_INVALID",
        equipmentId: item.equipmentId,
        validityStatus: validity.status,
      });
    }
    if (!isValid && item.override && !canOverride) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Forbidden" });
    }

    return {
      equipmentId: item.equipmentId,
      equipmentCalibrationRecordId: validity.recordId,
      validityOverridden: !isValid,
      overrideReason: !isValid ? (item.override?.reason ?? null) : null,
    };
  });
}
