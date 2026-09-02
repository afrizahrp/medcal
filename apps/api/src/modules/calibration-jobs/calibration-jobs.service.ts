import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { AkdAklApprovalStatus } from "@medcal/db";
import {
  CALIBRATION_JOB_SORTABLE_FIELDS,
  type CalibrationJobAssignDeviceInput,
  type CalibrationJobEscalateIdentityInput,
  type CalibrationJobIdentityDecisionInput,
  type CalibrationJobListQuery,
  type CalibrationJobRegisterDeviceInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";
import { DevicesService, type DeviceWithRelations } from "../devices/devices.service";

const calibrationJobInclude = {
  workOrder: { select: { id: true, number: true, status: true, customerId: true } },
  device: {
    select: { id: true, code: true, serialNumber: true, deviceTypeId: true, customerId: true },
  },
  calibrationRequestItem: {
    select: {
      id: true,
      customerDeviceName: true,
      akdAkl: true,
      deviceTypeId: true,
      deviceType: { select: { id: true, code: true, name: true } },
    },
  },
  purchaseOrderItem: {
    select: {
      quotationItem: {
        select: {
          requestItem: {
            select: {
              deviceTypeId: true,
              deviceType: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  },
  akdAklApprovedBy: { select: { id: true, name: true } },
} as const;

export type CalibrationJobDetail = Prisma.CalibrationJobGetPayload<{
  include: typeof calibrationJobInclude;
}>;

/**
 * Allowed transitions for CalibrationJob.akdAklApprovalStatus (the per-device
 * AKD/AKL/NIE regulatory gate). Mirrors the ALLOWED_TRANSITIONS pattern used
 * for WorkOrder status in work-orders.service.ts.
 *
 * - NOT_REQUIRED → PENDING_REVIEW: a technician escalates a missing declaration.
 * - PENDING_REVIEW → APPROVED / REJECTED: the TECHNICIAN_MANAGER decides.
 * - REJECTED → PENDING_REVIEW: re-escalation (e.g. the customer later supplies
 *   the AKL). APPROVED is terminal — a cleared device stays cleared.
 */
const AKD_AKL_TRANSITIONS: Record<AkdAklApprovalStatus, readonly AkdAklApprovalStatus[]> = {
  NOT_REQUIRED: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: ["PENDING_REVIEW"],
};

// Once execution has advanced past the bench, the identity gate is moot.
const IDENTITY_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);

function assertAkdAklTransition(from: AkdAklApprovalStatus, to: AkdAklApprovalStatus): void {
  if (!AKD_AKL_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException({
      message: `Cannot move AKD/AKL approval from ${from} to ${to}`,
      code: "INVALID_AKD_AKL_TRANSITION",
      from,
      to,
    });
  }
}

export interface CalibrationJobListResult {
  data: CalibrationJobDetail[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;

export interface CalibrationJobDeviceAssignmentResult {
  job: CalibrationJobDetail;
  /**
   * True when the assigned device's deviceTypeId was checked against the job's
   * resolved DeviceType. False only when the job's DeviceType could not be
   * resolved (no calibrationRequestItem and no walkable PO chain) — the device
   * is still assigned, just not validated.
   */
  deviceTypeValidated: boolean;
}

@Injectable()
export class CalibrationJobsService {
  private readonly devices = new DevicesService();

  /** Portal management list. Company-scoped; filters mirror the WorkOrder list. */
  async findAll(
    companyId: string,
    query: CalibrationJobListQuery,
  ): Promise<CalibrationJobListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CalibrationJobWhereInput = {
      companyId,
      ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
      ...(query.akdAklApprovalStatus ? { akdAklApprovalStatus: query.akdAklApprovalStatus } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { customerDeclaredDeviceName: { contains: query.search, mode: "insensitive" } },
              { technicianObservedSerial: { contains: query.search, mode: "insensitive" } },
              { workOrder: { number: { contains: query.search, mode: "insensitive" } } },
              { device: { serialNumber: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      CALIBRATION_JOB_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.calibrationJob.count({ where }),
      prisma.calibrationJob.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: calibrationJobInclude,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<CalibrationJobDetail> {
    const job = await prisma.calibrationJob.findFirst({
      where: { id, companyId },
      include: calibrationJobInclude,
    });
    if (!job) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    return job;
  }

  /** Technician (or their manager) raises the AKD/AKL/NIE gate for one device. */
  async escalateIdentity(
    companyId: string,
    id: string,
    input: CalibrationJobEscalateIdentityInput,
  ): Promise<CalibrationJobDetail> {
    const existing = await this.findOne(companyId, id);
    this.assertIdentityGateOpen(existing.status);
    assertAkdAklTransition(existing.akdAklApprovalStatus, "PENDING_REVIEW");

    await prisma.calibrationJob.update({
      where: { id },
      data: {
        akdAklApprovalStatus: "PENDING_REVIEW",
        ...(input.technicianObservedAkdAkl !== undefined
          ? { technicianObservedAkdAkl: input.technicianObservedAkdAkl }
          : {}),
        // v1: escalation reason rides on the decision-note column and is later
        // overwritten by the manager's rationale. Known gap — a dedicated
        // akdAklEscalationNote / audit-log is a future schema task.
        akdAklDecisionNote: input.reason ?? null,
        // Clear any stale approver stamp from a prior REJECTED decision.
        akdAklApprovedByUserId: null,
        akdAklApprovedAt: null,
      },
    });

    return this.findOne(companyId, id);
  }

  /** TECHNICIAN_MANAGER APPROVE/REJECT decision for one device. */
  async decideIdentity(
    companyId: string,
    id: string,
    userId: string,
    input: CalibrationJobIdentityDecisionInput,
  ): Promise<CalibrationJobDetail> {
    const existing = await this.findOne(companyId, id);
    this.assertIdentityGateOpen(existing.status);

    const target: AkdAklApprovalStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    assertAkdAklTransition(existing.akdAklApprovalStatus, target);

    await prisma.calibrationJob.update({
      where: { id },
      data: {
        akdAklApprovalStatus: target,
        akdAklApprovedByUserId: userId,
        akdAklApprovedAt: new Date(),
        ...(input.akdAklDecisionNote !== undefined
          ? { akdAklDecisionNote: input.akdAklDecisionNote }
          : {}),
      },
    });

    return this.findOne(companyId, id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Physical device assignment
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * The DeviceType this job's device is expected to be, resolved from the
   * commercial chain. Prefers the direct link (calibrationRequestItem), falls
   * back to the PO-item walk, and returns null when neither resolves.
   */
  private resolveJobDeviceTypeId(job: CalibrationJobDetail): string | null {
    return (
      job.calibrationRequestItem?.deviceTypeId ??
      job.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
      null
    );
  }

  private assertDeviceAssignable(job: CalibrationJobDetail): void {
    this.assertIdentityGateOpen(job.status);
    if (job.deviceId !== null) {
      throw new ConflictException({
        message:
          "This calibration job already has a device assigned. Re-assignment is handled by the identity correction workflow.",
        code: "CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED",
        deviceId: job.deviceId,
      });
    }
  }

  /** Bind an existing Device master row to the job. */
  async assignDevice(
    companyId: string,
    id: string,
    input: CalibrationJobAssignDeviceInput,
  ): Promise<CalibrationJobDeviceAssignmentResult> {
    const job = await this.findOne(companyId, id);
    this.assertDeviceAssignable(job);

    const device = await prisma.device.findFirst({
      where: { id: input.deviceId, companyId },
      select: { id: true, customerId: true, deviceTypeId: true },
    });
    if (!device) {
      throw new BadRequestException({
        message: "Device not found",
        code: "DEVICE_NOT_FOUND",
      });
    }

    if (device.customerId !== job.workOrder.customerId) {
      throw new BadRequestException({
        message: "Device belongs to a different customer than this work order",
        code: "DEVICE_CUSTOMER_MISMATCH",
      });
    }

    const resolvedDeviceTypeId = this.resolveJobDeviceTypeId(job);
    const deviceTypeValidated = resolvedDeviceTypeId !== null;
    if (deviceTypeValidated && device.deviceTypeId !== resolvedDeviceTypeId) {
      throw new BadRequestException({
        message: "Device type does not match the calibration job's device type",
        code: "DEVICE_TYPE_MISMATCH",
        expected: resolvedDeviceTypeId,
        actual: device.deviceTypeId,
      });
    }

    await this.bindDevice(id, device.id);
    return { job: await this.findOne(companyId, id), deviceTypeValidated };
  }

  /**
   * Register a brand-new Device for the job's customer + resolved DeviceType and
   * assign it, atomically. customerId and deviceTypeId are derived from the job,
   * never taken from the caller.
   */
  async registerDevice(
    companyId: string,
    id: string,
    input: CalibrationJobRegisterDeviceInput,
  ): Promise<CalibrationJobDeviceAssignmentResult> {
    const job = await this.findOne(companyId, id);
    this.assertDeviceAssignable(job);

    const deviceTypeId = this.resolveJobDeviceTypeId(job);
    if (deviceTypeId === null) {
      throw new BadRequestException({
        message:
          "Cannot register a device for this job: its device type could not be resolved from the requisition or purchase order. Match an existing device instead.",
        code: "CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED",
      });
    }

    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: a concurrent assignment may have landed
      // between findOne and here.
      const fresh = await tx.calibrationJob.findUniqueOrThrow({
        where: { id },
        select: { deviceId: true },
      });
      if (fresh.deviceId !== null) {
        throw new ConflictException({
          message: "This calibration job already has a device assigned.",
          code: "CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED",
          deviceId: fresh.deviceId,
        });
      }

      const device = await this.devices.create(
        companyId,
        {
          customerId: job.workOrder.customerId,
          deviceTypeId,
          brand: input.brand,
          model: input.model,
          // Prefill the serial from what the technician already recorded on the
          // job, unless the caller supplied one explicitly.
          serialNumber: input.serialNumber ?? job.technicianObservedSerial ?? undefined,
          category: input.category,
          locationText: input.locationText,
          status: input.status,
        },
        tx,
      );

      await tx.calibrationJob.update({
        where: { id },
        data: { deviceId: device.id },
      });
    });

    return { job: await this.findOne(companyId, id), deviceTypeValidated: true };
  }

  private async bindDevice(jobId: string, deviceId: string): Promise<void> {
    try {
      await prisma.calibrationJob.update({
        where: { id: jobId },
        data: { deviceId },
      });
    } catch (error) {
      // @@unique([workOrderId, deviceId]) — the same physical device is already
      // matched to another job on this work order.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          message: "This device is already assigned to another job on the same work order",
          code: "DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER",
        });
      }
      throw error;
    }
  }

  /** Existing devices this job could be matched to — scoped to the job's customer
   * and (when resolvable) DeviceType. Reuses the generic device search. */
  async findDeviceCandidates(
    companyId: string,
    id: string,
    search: string | undefined,
  ): Promise<DeviceWithRelations[]> {
    const job = await this.findOne(companyId, id);
    const deviceTypeId = this.resolveJobDeviceTypeId(job);
    const result = await this.devices.findAll(companyId, {
      ...(search ? { search } : {}),
      customerId: job.workOrder.customerId,
      ...(deviceTypeId ? { deviceTypeId } : {}),
      status: "ACTIVE",
      pageSize: 20,
    });
    return result.data;
  }

  private assertIdentityGateOpen(jobStatus: string): void {
    if (IDENTITY_LOCKED_JOB_STATUSES.has(jobStatus)) {
      throw new BadRequestException({
        message: "Calibration job has advanced past the identity gate",
        code: "CALIBRATION_JOB_IDENTITY_GATE_LOCKED",
        status: jobStatus,
      });
    }
  }
}
