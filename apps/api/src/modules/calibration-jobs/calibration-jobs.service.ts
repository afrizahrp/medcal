import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { AkdAklApprovalStatus } from "@medcal/db";
import type {
  CalibrationJobEscalateIdentityInput,
  CalibrationJobIdentityDecisionInput,
} from "@medcal/shared";

const calibrationJobInclude = {
  workOrder: { select: { id: true, number: true, status: true } },
  calibrationRequestItem: {
    select: { id: true, customerDeviceName: true, akdAkl: true },
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

@Injectable()
export class CalibrationJobsService {
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
