import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { MeasurementDirection, MeasurementEntryKind } from "@medcal/db";
import {
  computeIsWithinTolerance,
  resolveEffectiveTolerance,
  type ResolvedTolerance,
} from "./measurement-tolerance";

/**
 * Service layer for MeasurementResult — the "locked after submit" guard, the
 * tolerance-resolution snapshot, and CRUD. No controller / HTTP wiring lives
 * here (that is Stage 2c); this file is the logic against the Stage 2a schema.
 *
 * Design source: MeasurementResult_Stage1_Design_Finalization.md §7 (guard),
 * §8 (isWithinTolerance) and §4 (worked examples). The guard mirrors the
 * existing IDENTITY_LOCKED_JOB_STATUSES / REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES
 * pattern in calibration-jobs.service.ts.
 */

/** Mirrors IDENTITY_LOCKED_JOB_STATUSES / REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES. */
export const MEASUREMENT_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);

/**
 * RBAC capability that gates every measurement write. Defined here alongside the
 * logic; the `@RequirePermission` wiring is added with the controller in Stage
 * 2c. Granted to TECHNICIAN + TECHNICIAN_MANAGER (see seed-role-permissions.ts),
 * mirroring `calibrationJob:recordReferenceEquipmentUsed`.
 */
export const RECORD_MEASUREMENT_PERMISSION = {
  resource: "calibrationJob",
  action: "recordMeasurement",
} as const;

interface GuardJob {
  status: string;
  currentAttempt: number;
  submittedAt: Date | null;
}

/**
 * A MeasurementResult row is immutable when EITHER:
 *  - it belongs to a superseded attempt (row.attemptNumber < job.currentAttempt), OR
 *  - the job's current attempt has been submitted (status in the locked set, or
 *    submittedAt is set — redundant by design, §7.1).
 *
 * Role-independent — no bypass, including TECHNICIAN_MANAGER (decision #5).
 * Called at the top of every create / update / delete path.
 */
export function assertMeasurementRowEditable(job: GuardJob, row: { attemptNumber: number }): void {
  if (row.attemptNumber < job.currentAttempt) {
    throw new BadRequestException({
      message: "This reading belongs to a superseded attempt and is immutable",
      code: "MEASUREMENT_ATTEMPT_SUPERSEDED",
      attemptNumber: row.attemptNumber,
      currentAttempt: job.currentAttempt,
    });
  }
  if (MEASUREMENT_LOCKED_JOB_STATUSES.has(job.status) || job.submittedAt !== null) {
    throw new BadRequestException({
      message: "Measurements are locked once the job attempt has been submitted",
      code: "MEASUREMENT_JOB_SUBMITTED",
      status: job.status,
    });
  }
}

// ── Input shapes (kept local — the zod request schemas land in Stage 2c) ─────

export interface CreateMeasurementResultInput {
  calibrationJobId: string;
  deviceCalibrationParameterId: string;
  calibrationTestPointId?: string | null;
  replicateIndex: number;
  direction?: MeasurementDirection;
  entryKind?: MeasurementEntryKind;
  measuredValue?: number | string | null;
  referenceValue?: number | string | null;
  measuredBool?: boolean | null;
  measuredText?: string | null;
  uomId?: string | null;
  /** Technician-chosen nominal for the Pattern D generic-slot case. */
  suppliedNominalValue?: number | string | null;
  attachmentFileObjectId?: string | null;
  note?: string | null;
}

export interface UpdateMeasurementResultInput {
  measuredValue?: number | string | null;
  measuredText?: string | null;
  measuredBool?: boolean | null;
  referenceValue?: number | string | null;
  note?: string | null;
}

const parameterSelect = {
  id: true,
  valueType: true,
  toleranceMin: true,
  toleranceMax: true,
  toleranceNote: true,
} as const;

const testPointSelect = {
  id: true,
  deviceCalibrationParameterId: true,
  settingValue: true,
  toleranceMin: true,
  toleranceMax: true,
  toleranceNote: true,
} as const;

@Injectable()
export class MeasurementResultsService {
  /**
   * Record one reading. Runs the guard, resolves + snapshots the effective
   * tolerance, computes isWithinTolerance from the raw value, and stamps
   * recordedBy / recordedAt / attemptNumber (= job.currentAttempt).
   */
  async create(companyId: string, input: CreateMeasurementResultInput, userId: string) {
    const job = await this.loadJob(companyId, input.calibrationJobId);
    this.assertJobStarted(job);
    // A brand-new row is always for the current attempt, so the superseded
    // branch of the guard can never fire here — but run it for symmetry / future
    // safety.
    assertMeasurementRowEditable(job, { attemptNumber: job.currentAttempt });

    const { parameter, testPoint } = await this.loadCatalog(
      input.deviceCalibrationParameterId,
      input.calibrationTestPointId ?? null,
    );

    const resolved = resolveEffectiveTolerance({
      valueType: parameter.valueType,
      parameter,
      testPoint,
      suppliedNominalValue: input.suppliedNominalValue,
    });

    const isWithinTolerance = computeIsWithinTolerance({
      valueType: parameter.valueType,
      measuredValue: input.measuredValue,
      measuredBool: input.measuredBool,
      effectiveToleranceMin: resolved.effectiveToleranceMin,
      effectiveToleranceMax: resolved.effectiveToleranceMax,
    });

    return this.translateUnique(() =>
      prisma.measurementResult.create({
        data: {
          companyId,
          calibrationJobId: job.id,
          deviceCalibrationParameterId: parameter.id,
          calibrationTestPointId: testPoint?.id ?? null,
          replicateIndex: input.replicateIndex,
          attemptNumber: job.currentAttempt,
          direction: input.direction ?? "NONE",
          entryKind: input.entryKind ?? "DIRECT_READING",
          measuredValue: toDecimalOrNull(input.measuredValue),
          referenceValue: toDecimalOrNull(input.referenceValue),
          measuredBool: input.measuredBool ?? null,
          measuredText: input.measuredText ?? null,
          uomId: input.uomId ?? null,
          ...snapshotData(resolved),
          isWithinTolerance,
          attachmentFileObjectId: input.attachmentFileObjectId ?? null,
          recordedByUserId: userId,
          recordedAt: new Date(),
          note: input.note ?? null,
        },
      }),
    );
  }

  /**
   * Create/replace many readings in one transaction — the shape Stage 2c's
   * tech-pwa batch submit needs (a grid of replicates/points at once). Each row
   * is guarded + resolved independently; a duplicate natural key anywhere rolls
   * the whole batch back with MEASUREMENT_DUPLICATE_ENTRY.
   */
  async createMany(companyId: string, inputs: CreateMeasurementResultInput[], userId: string) {
    if (inputs.length === 0) return [];

    // Every row in a batch must target the same job (the tech-pwa submit is
    // job-scoped) — cheaper to enforce than to load N jobs.
    const jobIds = new Set(inputs.map((i) => i.calibrationJobId));
    if (jobIds.size !== 1) {
      throw new BadRequestException({
        message: "A measurement batch must target a single calibration job",
        code: "MEASUREMENT_BATCH_MULTIPLE_JOBS",
      });
    }

    const job = await this.loadJob(companyId, inputs[0]!.calibrationJobId);
    this.assertJobStarted(job);
    assertMeasurementRowEditable(job, { attemptNumber: job.currentAttempt });

    const prepared = await Promise.all(
      inputs.map(async (input) => {
        const { parameter, testPoint } = await this.loadCatalog(
          input.deviceCalibrationParameterId,
          input.calibrationTestPointId ?? null,
        );
        const resolved = resolveEffectiveTolerance({
          valueType: parameter.valueType,
          parameter,
          testPoint,
          suppliedNominalValue: input.suppliedNominalValue,
        });
        return {
          companyId,
          calibrationJobId: job.id,
          deviceCalibrationParameterId: parameter.id,
          calibrationTestPointId: testPoint?.id ?? null,
          replicateIndex: input.replicateIndex,
          attemptNumber: job.currentAttempt,
          direction: input.direction ?? ("NONE" as const),
          entryKind: input.entryKind ?? ("DIRECT_READING" as const),
          measuredValue: toDecimalOrNull(input.measuredValue),
          referenceValue: toDecimalOrNull(input.referenceValue),
          measuredBool: input.measuredBool ?? null,
          measuredText: input.measuredText ?? null,
          uomId: input.uomId ?? null,
          ...snapshotData(resolved),
          isWithinTolerance: computeIsWithinTolerance({
            valueType: parameter.valueType,
            measuredValue: input.measuredValue,
            measuredBool: input.measuredBool,
            effectiveToleranceMin: resolved.effectiveToleranceMin,
            effectiveToleranceMax: resolved.effectiveToleranceMax,
          }),
          attachmentFileObjectId: input.attachmentFileObjectId ?? null,
          recordedByUserId: userId,
          recordedAt: new Date(),
          note: input.note ?? null,
        };
      }),
    );

    return this.translateUnique(() =>
      prisma.$transaction(prepared.map((data) => prisma.measurementResult.create({ data }))),
    );
  }

  /**
   * Update the mutable value fields of one draft reading. Re-resolves and
   * re-snapshots the effective tolerance when a value that feeds it changed,
   * and always recomputes isWithinTolerance when the reading changed.
   *
   * `recordedByUserId` / `recordedAt` are re-stamped to the editing actor on
   * EVERY successful update (a note-only edit included) — they mean "who is
   * responsible for the current value", not "who first created the row".
   */
  async update(
    companyId: string,
    id: string,
    input: UpdateMeasurementResultInput,
    userId: string,
  ) {
    const row = await prisma.measurementResult.findFirst({
      where: { id, companyId },
      include: { calibrationJob: { select: { status: true, currentAttempt: true, submittedAt: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        message: "Measurement result not found",
        code: "MEASUREMENT_RESULT_NOT_FOUND",
      });
    }
    assertMeasurementRowEditable(row.calibrationJob, row);

    const data: Prisma.MeasurementResultUncheckedUpdateInput = {
      recordedByUserId: userId,
      recordedAt: new Date(),
    };
    if (input.note !== undefined) data.note = input.note;
    if (input.referenceValue !== undefined) {
      data.referenceValue = toDecimalOrNull(input.referenceValue);
    }

    const measuredValueChanged =
      input.measuredValue !== undefined &&
      !decimalEquals(input.measuredValue, row.measuredValue);
    const measuredBoolChanged =
      input.measuredBool !== undefined && (input.measuredBool ?? null) !== row.measuredBool;
    const measuredTextChanged =
      input.measuredText !== undefined && (input.measuredText ?? null) !== row.measuredText;

    if (input.measuredValue !== undefined) data.measuredValue = toDecimalOrNull(input.measuredValue);
    if (input.measuredBool !== undefined) data.measuredBool = input.measuredBool ?? null;
    if (input.measuredText !== undefined) data.measuredText = input.measuredText ?? null;

    if (measuredValueChanged || measuredBoolChanged || measuredTextChanged) {
      const { parameter, testPoint } = await this.loadCatalog(
        row.deviceCalibrationParameterId,
        row.calibrationTestPointId,
      );
      // Re-resolve against the snapshotted nominal (never re-derive it — the
      // technician's on-site setpoint choice is frozen at first write).
      const resolved = resolveEffectiveTolerance({
        valueType: parameter.valueType,
        parameter,
        testPoint,
        suppliedNominalValue: row.appliedNominalValue,
      });
      Object.assign(data, snapshotData(resolved));
      data.isWithinTolerance = computeIsWithinTolerance({
        valueType: parameter.valueType,
        measuredValue: input.measuredValue !== undefined ? input.measuredValue : row.measuredValue,
        measuredBool: input.measuredBool !== undefined ? input.measuredBool : row.measuredBool,
        effectiveToleranceMin: resolved.effectiveToleranceMin,
        effectiveToleranceMax: resolved.effectiveToleranceMax,
      });
    }

    return this.translateUnique(() => prisma.measurementResult.update({ where: { id }, data }));
  }

  /**
   * Hard-delete one draft reading.
   *
   * RECOMMENDATION (see report §): hard delete is correct here. The guard makes
   * every deletable row a pre-submission draft of the current attempt by
   * definition — a submitted or superseded reading can never reach this path —
   * so there is no audit value to preserve, unlike IdentityCorrection /
   * JobReferenceEquipmentUsed where post-decision rows must survive. A
   * soft-delete flag would also have to be threaded through the natural-key
   * unique constraint (a deleted row would still block re-entry of the same
   * point), which is a real cost for no benefit.
   */
  async remove(companyId: string, id: string): Promise<void> {
    const row = await prisma.measurementResult.findFirst({
      where: { id, companyId },
      include: { calibrationJob: { select: { status: true, currentAttempt: true, submittedAt: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        message: "Measurement result not found",
        code: "MEASUREMENT_RESULT_NOT_FOUND",
      });
    }
    assertMeasurementRowEditable(row.calibrationJob, row);
    await prisma.measurementResult.delete({ where: { id } });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async loadJob(companyId: string, jobId: string) {
    const job = await prisma.calibrationJob.findFirst({
      where: { id: jobId, companyId },
      select: { id: true, status: true, currentAttempt: true, startedAt: true, submittedAt: true },
    });
    if (!job) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    return job;
  }

  /** Creation additionally requires the job to have been started (§7.1). */
  private assertJobStarted(job: { startedAt: Date | null }): void {
    if (job.startedAt === null) {
      throw new BadRequestException({
        message: "Record measurements only after the job has started",
        code: "CALIBRATION_JOB_NOT_STARTED",
      });
    }
  }

  private async loadCatalog(parameterId: string, testPointId: string | null) {
    const parameter = await prisma.deviceCalibrationParameter.findUnique({
      where: { id: parameterId },
      select: parameterSelect,
    });
    if (!parameter) {
      throw new BadRequestException({
        message: "Calibration parameter not found",
        code: "DEVICE_CALIBRATION_PARAMETER_NOT_FOUND",
      });
    }

    if (testPointId === null) return { parameter, testPoint: null };

    const testPoint = await prisma.calibrationTestPoint.findUnique({
      where: { id: testPointId },
      select: testPointSelect,
    });
    if (!testPoint) {
      throw new BadRequestException({
        message: "Calibration test point not found",
        code: "CALIBRATION_TEST_POINT_NOT_FOUND",
      });
    }
    if (testPoint.deviceCalibrationParameterId !== parameter.id) {
      throw new BadRequestException({
        message: "Test point does not belong to the given calibration parameter",
        code: "CALIBRATION_TEST_POINT_PARAMETER_MISMATCH",
      });
    }
    return { parameter, testPoint };
  }

  /**
   * Translate the natural-key unique-constraint violation into a clear
   * application error rather than leaking a raw Postgres P2002.
   */
  private async translateUnique<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          message:
            "A reading already exists for this job / parameter / test point / replicate / attempt / direction",
          code: "MEASUREMENT_DUPLICATE_ENTRY",
        });
      }
      throw error;
    }
  }
}

// ── module-private value helpers ────────────────────────────────────────────

function toDecimalOrNull(value: number | string | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

function decimalEquals(
  next: number | string | null | undefined,
  current: Prisma.Decimal | null,
): boolean {
  const a = toDecimalOrNull(next);
  if (a === null && current === null) return true;
  if (a === null || current === null) return false;
  return a.equals(current);
}

function snapshotData(resolved: ResolvedTolerance) {
  return {
    effectiveToleranceMin: resolved.effectiveToleranceMin,
    effectiveToleranceMax: resolved.effectiveToleranceMax,
    appliedNominalValue: resolved.appliedNominalValue,
  };
}
