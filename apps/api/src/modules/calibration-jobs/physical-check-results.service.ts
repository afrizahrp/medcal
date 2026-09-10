import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { PhysicalCheckVerdict } from "@medcal/db";

/**
 * Service layer for Physical Inspection — catalog GET, write guard (IN_PROGRESS
 * only, current attempt), DeviceType ownership, active-master rule, and CRUD.
 * Separate domain from MeasurementResult: no tolerance engine, no replicate /
 * direction / testPoint. BAIK / TIDAK_BAIK is a technician judgment.
 *
 * Write-guard behaviour mirrors assertMeasurementRowEditable (not the
 * JobReferenceEquipmentUsed lock, which still allows REWORK writes).
 */

/** Same locked statuses as MEASUREMENT_LOCKED_JOB_STATUSES. */
export const PHYSICAL_CHECK_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);

/**
 * RBAC capability that gates every Physical Inspection write. Granted to
 * TECHNICIAN only — not recordMeasurement, not TECHNICIAN_MANAGER.
 */
export const RECORD_PHYSICAL_CHECK_PERMISSION = {
  resource: "calibrationJob",
  action: "recordPhysicalCheck",
} as const;

interface GuardJob {
  status: string;
  currentAttempt: number;
  submittedAt: Date | null;
}

/**
 * A PhysicalCheckResult row is immutable when:
 *  - it belongs to a superseded attempt (row.attemptNumber < job.currentAttempt), OR
 *  - the job's current attempt has been submitted, OR
 *  - the job is not IN_PROGRESS (PENDING / REWORK / etc. are not writable —
 *    resumeAfterRework is the write gate).
 *
 * Role-independent — no bypass, including TECHNICIAN_MANAGER.
 */
export function assertPhysicalCheckRowEditable(job: GuardJob, row: { attemptNumber: number }): void {
  if (row.attemptNumber < job.currentAttempt) {
    throw new BadRequestException({
      message: "This physical check belongs to a superseded attempt and is immutable",
      code: "PHYSICAL_CHECK_ATTEMPT_SUPERSEDED",
      attemptNumber: row.attemptNumber,
      currentAttempt: job.currentAttempt,
    });
  }
  if (PHYSICAL_CHECK_LOCKED_JOB_STATUSES.has(job.status) || job.submittedAt !== null) {
    throw new BadRequestException({
      message: "Physical checks are locked once the job attempt has been submitted",
      code: "PHYSICAL_CHECK_JOB_SUBMITTED",
      status: job.status,
    });
  }
  if (job.status !== "IN_PROGRESS") {
    throw new BadRequestException({
      message: "Record physical checks only while the job is in progress",
      code: "PHYSICAL_CHECK_JOB_NOT_IN_PROGRESS",
      status: job.status,
    });
  }
}

export interface CreatePhysicalCheckResultInput {
  calibrationJobId: string;
  devicePhysicalCheckItemId: string;
  verdict: PhysicalCheckVerdict;
  note?: string | null;
}

export interface UpdatePhysicalCheckResultInput {
  verdict?: PhysicalCheckVerdict;
  note?: string | null;
}

const itemSelect = {
  id: true,
  deviceTypeId: true,
  code: true,
  name: true,
  inspectionLimit: true,
  sortOrder: true,
  isActive: true,
} as const;

const resultInclude = {
  devicePhysicalCheckItem: { select: itemSelect },
} as const;

export type DevicePhysicalCheckItemRow = Prisma.DevicePhysicalCheckItemGetPayload<object>;

export type PhysicalCheckResultRow = Prisma.PhysicalCheckResultGetPayload<{
  include: typeof resultInclude;
}>;

const jobDeviceTypeSelect = {
  id: true,
  status: true,
  currentAttempt: true,
  startedAt: true,
  submittedAt: true,
  calibrationRequestItem: { select: { deviceTypeId: true } },
  purchaseOrderItem: {
    select: {
      quotationItem: {
        select: {
          requestItem: { select: { deviceTypeId: true } },
        },
      },
    },
  },
} as const;

type JobForPhysicalCheck = Prisma.CalibrationJobGetPayload<{ select: typeof jobDeviceTypeSelect }>;

/** Same resolution order as CalibrationJobsService.resolveJobDeviceTypeId. */
function resolveJobDeviceTypeId(job: JobForPhysicalCheck): string | null {
  return (
    job.calibrationRequestItem?.deviceTypeId ??
    job.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
    null
  );
}

@Injectable()
export class PhysicalCheckResultsService {
  /**
   * Active Physical Inspection catalog for the job's resolved DeviceType.
   * Empty array when the DeviceType is unresolved or has zero items.
   */
  async listItems(companyId: string, calibrationJobId: string): Promise<DevicePhysicalCheckItemRow[]> {
    const job = await this.loadJob(companyId, calibrationJobId);
    const deviceTypeId = resolveJobDeviceTypeId(job);
    if (deviceTypeId === null) return [];

    return prisma.devicePhysicalCheckItem.findMany({
      where: { deviceTypeId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  /**
   * All PhysicalCheckResult rows for one job (every attempt). Company-scoped.
   * Does not filter historical attempts — UI distinguishes by attemptNumber.
   */
  async list(companyId: string, calibrationJobId: string): Promise<PhysicalCheckResultRow[]> {
    await this.loadJob(companyId, calibrationJobId);
    return prisma.physicalCheckResult.findMany({
      where: { companyId, calibrationJobId },
      include: resultInclude,
      orderBy: [
        { devicePhysicalCheckItem: { sortOrder: "asc" } },
        { devicePhysicalCheckItemId: "asc" },
        { attemptNumber: "asc" },
      ],
    });
  }

  async create(
    companyId: string,
    input: CreatePhysicalCheckResultInput,
    userId: string,
  ): Promise<PhysicalCheckResultRow> {
    const job = await this.loadJob(companyId, input.calibrationJobId);
    this.assertJobStarted(job);
    assertPhysicalCheckRowEditable(job, { attemptNumber: job.currentAttempt });

    const item = await this.loadWritableItem(job, input.devicePhysicalCheckItemId);

    return this.translateUnique(() =>
      prisma.physicalCheckResult.create({
        data: {
          companyId,
          calibrationJobId: job.id,
          devicePhysicalCheckItemId: item.id,
          attemptNumber: job.currentAttempt,
          verdict: input.verdict,
          note: input.note ?? null,
          inspectionLimitSnapshot: item.inspectionLimit,
          recordedByUserId: userId,
          recordedAt: new Date(),
        },
        include: resultInclude,
      }),
    );
  }

  async createMany(
    companyId: string,
    inputs: CreatePhysicalCheckResultInput[],
    userId: string,
  ): Promise<PhysicalCheckResultRow[]> {
    if (inputs.length === 0) return [];

    const jobIds = new Set(inputs.map((i) => i.calibrationJobId));
    if (jobIds.size !== 1) {
      throw new BadRequestException({
        message: "A physical-check batch must target a single calibration job",
        code: "PHYSICAL_CHECK_BATCH_MULTIPLE_JOBS",
      });
    }

    const job = await this.loadJob(companyId, inputs[0]!.calibrationJobId);
    this.assertJobStarted(job);
    assertPhysicalCheckRowEditable(job, { attemptNumber: job.currentAttempt });

    const recordedAt = new Date();
    const prepared = await Promise.all(
      inputs.map(async (input) => {
        const item = await this.loadWritableItem(job, input.devicePhysicalCheckItemId);
        return {
          companyId,
          calibrationJobId: job.id,
          devicePhysicalCheckItemId: item.id,
          attemptNumber: job.currentAttempt,
          verdict: input.verdict,
          note: input.note ?? null,
          inspectionLimitSnapshot: item.inspectionLimit,
          recordedByUserId: userId,
          recordedAt,
        };
      }),
    );

    return this.translateUnique(() =>
      prisma.$transaction(
        prepared.map((data) => prisma.physicalCheckResult.create({ data, include: resultInclude })),
      ),
    );
  }

  /**
   * Update verdict / note of a current-attempt draft. Does NOT rewrite
   * inspectionLimitSnapshot — historical (and current) snapshots stay frozen.
   * recordedByUserId / recordedAt are re-stamped to the editing actor.
   */
  async update(
    companyId: string,
    id: string,
    input: UpdatePhysicalCheckResultInput,
    userId: string,
    calibrationJobId?: string,
  ): Promise<PhysicalCheckResultRow> {
    const row = await this.loadRowForWrite(companyId, id, calibrationJobId);
    assertPhysicalCheckRowEditable(row.calibrationJob, row);

    const data: Prisma.PhysicalCheckResultUncheckedUpdateInput = {
      recordedByUserId: userId,
      recordedAt: new Date(),
    };
    if (input.verdict !== undefined) data.verdict = input.verdict;
    if (input.note !== undefined) data.note = input.note;

    return prisma.physicalCheckResult.update({
      where: { id },
      data,
      include: resultInclude,
    });
  }

  async remove(companyId: string, id: string, calibrationJobId?: string): Promise<void> {
    const row = await this.loadRowForWrite(companyId, id, calibrationJobId);
    assertPhysicalCheckRowEditable(row.calibrationJob, row);
    await prisma.physicalCheckResult.delete({ where: { id } });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async loadRowForWrite(companyId: string, id: string, calibrationJobId?: string) {
    const row = await prisma.physicalCheckResult.findFirst({
      where: { id, companyId, ...(calibrationJobId ? { calibrationJobId } : {}) },
      include: {
        calibrationJob: { select: { status: true, currentAttempt: true, submittedAt: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: "Physical check result not found",
        code: "PHYSICAL_CHECK_RESULT_NOT_FOUND",
      });
    }
    return row;
  }

  private async loadJob(companyId: string, jobId: string): Promise<JobForPhysicalCheck> {
    const job = await prisma.calibrationJob.findFirst({
      where: { id: jobId, companyId },
      select: jobDeviceTypeSelect,
    });
    if (!job) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    return job;
  }

  private assertJobStarted(job: { startedAt: Date | null }): void {
    if (job.startedAt === null) {
      throw new BadRequestException({
        message: "Record physical checks only after the job has started",
        code: "CALIBRATION_JOB_NOT_STARTED",
      });
    }
  }

  /**
   * Load a catalog item that may be used for a NEW write: must exist, belong to
   * the job's resolved DeviceType, and be active. Unresolved DeviceType is a
   * write reject — do not invent a DeviceType.
   */
  private async loadWritableItem(job: JobForPhysicalCheck, itemId: string) {
    const deviceTypeId = resolveJobDeviceTypeId(job);
    if (deviceTypeId === null) {
      throw new BadRequestException({
        message: "Calibration job device type cannot be resolved",
        code: "PHYSICAL_CHECK_DEVICE_TYPE_UNRESOLVED",
      });
    }

    const item = await prisma.devicePhysicalCheckItem.findUnique({
      where: { id: itemId },
      select: { id: true, deviceTypeId: true, isActive: true, inspectionLimit: true },
    });
    if (!item) {
      throw new BadRequestException({
        message: "Physical check item not found",
        code: "PHYSICAL_CHECK_ITEM_NOT_FOUND",
      });
    }
    if (item.deviceTypeId !== deviceTypeId) {
      throw new BadRequestException({
        message: "Physical check item does not belong to this job's device type",
        code: "PHYSICAL_CHECK_DEVICE_TYPE_MISMATCH",
        expected: deviceTypeId,
        actual: item.deviceTypeId,
      });
    }
    if (!item.isActive) {
      throw new BadRequestException({
        message: "Physical check item is inactive and cannot be used for new results",
        code: "PHYSICAL_CHECK_ITEM_INACTIVE",
      });
    }
    return item;
  }

  private async translateUnique<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          message: "A physical check already exists for this job / item / attempt",
          code: "PHYSICAL_CHECK_DUPLICATE_ENTRY",
        });
      }
      throw error;
    }
  }
}
