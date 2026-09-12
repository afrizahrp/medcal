import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { KontrolAlatSignerKind } from "@medcal/db";
import type {
  KontrolAlatAccessoryCreateInput,
  KontrolAlatAccessoryUpdateInput,
  KontrolAlatPatchInput,
  KontrolAlatSignatureCreateInput,
} from "@medcal/shared";
import {
  renderKontrolAlatPdf,
  type KontrolAlatPdfResult,
} from "./kontrol-alat-pdf";

/**
 * F.MU.08 Kontrol Alat — intake / inspection / signatures for one In Lab unit.
 * SEND_TO_LAB only. ON_SITE writes and nested GET are rejected with
 * KONTROL_ALAT_NOT_APPLICABLE. Do not reuse recordPhysicalCheck / recordMeasurement.
 */
export const RECORD_KONTROL_ALAT_PERMISSION = {
  resource: "calibrationJob",
  action: "recordKontrolAlat",
} as const;

/**
 * Hard start-gate for In Lab jobs. ON_SITE / SPK is a no-op.
 *
 * SEND_TO_LAB may start only when workExecuted === true and both
 * ADMINISTRATION + TECHNICAL_OFFICER signatures have signedAt.
 * functionFinalOk and WorkOrder.requestReviewCompletedAt are not required.
 */
export async function assertKontrolAlatReadyForStart(
  serviceMode: string,
  calibrationJobId: string,
): Promise<void> {
  if (serviceMode !== "SEND_TO_LAB") {
    return;
  }

  const row = await prisma.kontrolAlat.findUnique({
    where: { calibrationJobId },
    include: { signatures: true },
  });

  if (row?.workExecuted === false) {
    throw new BadRequestException({
      message: "This job cannot be started because work was marked as not executed",
      code: "KONTROL_ALAT_NOT_EXECUTED",
    });
  }

  const adminSigned = row?.signatures.some(
    (signature) => signature.signerKind === "ADMINISTRATION" && signature.signedAt != null,
  );
  const technicalSigned = row?.signatures.some(
    (signature) => signature.signerKind === "TECHNICAL_OFFICER" && signature.signedAt != null,
  );

  if (row == null || row.workExecuted !== true || !adminSigned || !technicalSigned) {
    throw new BadRequestException({
      message: "Kontrol Alat must be completed and signed before starting this In Lab job",
      code: "KONTROL_ALAT_INCOMPLETE",
    });
  }
}

const kontrolAlatInclude = {
  accessories: { orderBy: { sortOrder: "asc" as const } },
  signatures: { orderBy: { signerKind: "asc" as const } },
  createdBy: { select: { id: true, name: true } },
} as const;

export type KontrolAlatDetail = Prisma.KontrolAlatGetPayload<{
  include: typeof kontrolAlatInclude;
}>;

interface JobForKontrolAlat {
  id: string;
  companyId: string;
  workOrder: { id: string; serviceMode: string };
}

@Injectable()
export class KontrolAlatService {
  async get(companyId: string, calibrationJobId: string): Promise<KontrolAlatDetail> {
    const job = await this.requireSendToLabJob(companyId, calibrationJobId);
    return this.requireKontrolAlat(job.id);
  }

  async buildPdf(companyId: string, calibrationJobId: string): Promise<KontrolAlatPdfResult> {
    await this.requireSendToLabJob(companyId, calibrationJobId);

    const [company, fullJob, kontrolAlat, approvedReview] = await Promise.all([
      prisma.company.findFirst({
        where: { id: companyId },
        select: { id: true, name: true, legalName: true },
      }),
      prisma.calibrationJob.findFirst({
        where: { id: calibrationJobId, companyId },
        select: {
          unitOrdinal: true,
          unitTotal: true,
          startedAt: true,
          submittedAt: true,
          device: {
            select: { brand: true, model: true, serialNumber: true },
          },
          calibrationRequestItem: {
            select: { deviceType: { select: { name: true } } },
          },
          purchaseOrderItem: {
            select: {
              device: { select: { brand: true, model: true, serialNumber: true } },
              quotationItem: {
                select: {
                  requestItem: { select: { deviceType: { select: { name: true } } } },
                },
              },
            },
          },
          workOrder: {
            select: {
              number: true,
              customer: { select: { name: true } },
              purchaseOrder: { select: { customerPoNumber: true } },
              requestReviewMethodOk: true,
              requestReviewEquipmentOk: true,
              requestReviewPersonnelOk: true,
              requestReviewConfirmAgree: true,
              requestReviewConfirmEmail: true,
              requestReviewConfirmLetter: true,
              requestReviewConfirmOther: true,
              requestReviewConfirmOtherText: true,
              requestReviewCompletedAt: true,
              requestReviewCompletedBy: { select: { name: true } },
            },
          },
        },
      }),
      prisma.kontrolAlat.findUnique({
        where: { calibrationJobId },
        include: {
          accessories: { orderBy: { sortOrder: "asc" } },
          signatures: { orderBy: { signerKind: "asc" } },
        },
      }),
      prisma.qualityReview.findFirst({
        where: { companyId, calibrationJobId, status: "APPROVED" },
        orderBy: { reviewedAt: "desc" },
        select: { reviewedAt: true },
      }),
    ]);

    if (!company) {
      throw new NotFoundException({ message: "Company not found", code: "COMPANY_NOT_FOUND" });
    }
    if (!fullJob) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    if (!kontrolAlat) {
      throw new NotFoundException({
        message: "Kontrol Alat not found",
        code: "KONTROL_ALAT_NOT_FOUND",
      });
    }

    const linkedDevice = fullJob.device ?? fullJob.purchaseOrderItem?.device ?? null;
    const deviceTypeName =
      fullJob.calibrationRequestItem?.deviceType.name ??
      fullJob.purchaseOrderItem?.quotationItem?.requestItem?.deviceType.name ??
      null;

    return renderKontrolAlatPdf({
      company,
      job: {
        unitOrdinal: fullJob.unitOrdinal,
        unitTotal: fullJob.unitTotal,
        startedAt: fullJob.startedAt,
        submittedAt: fullJob.submittedAt,
        deviceBrand: linkedDevice?.brand ?? null,
        deviceModel: linkedDevice?.model ?? null,
        deviceSerial: linkedDevice?.serialNumber ?? null,
        deviceTypeName,
      },
      workOrder: fullJob.workOrder,
      kontrolAlat: {
        number: kontrolAlat.number,
        createdAt: kontrolAlat.createdAt,
        workExecuted: kontrolAlat.workExecuted,
        notExecutedReason: kontrolAlat.notExecutedReason,
        capacity: kontrolAlat.capacity,
        visualPowerCable: kontrolAlat.visualPowerCable,
        visualDisplay: kontrolAlat.visualDisplay,
        visualButtons: kontrolAlat.visualButtons,
        functionInitialOk: kontrolAlat.functionInitialOk,
        functionFinalOk: kontrolAlat.functionFinalOk,
        certificateNumber: kontrolAlat.certificateNumber,
        completedAt: kontrolAlat.completedAt,
        accessories: kontrolAlat.accessories.map((a) => ({
          label: a.label,
          present: a.present,
          sortOrder: a.sortOrder,
        })),
        signatures: kontrolAlat.signatures.map((s) => ({
          signerKind: s.signerKind,
          signerName: s.signerName ?? "",
          signedAt: s.signedAt,
        })),
      },
      completedAt: approvedReview?.reviewedAt ?? null,
    });
  }

  async patch(
    companyId: string,
    calibrationJobId: string,
    userId: string,
    input: KontrolAlatPatchInput,
  ): Promise<KontrolAlatDetail> {
    const job = await this.requireSendToLabJob(companyId, calibrationJobId);
    const existing = await this.requireKontrolAlat(job.id);

    if (input.certificateNumber !== undefined && input.certificateNumber !== null) {
      await this.assertCertificateNumberAllowed(companyId, job.id);
    }

    const nextWorkExecuted =
      input.workExecuted !== undefined ? input.workExecuted : existing.workExecuted;
    const nextReason =
      input.notExecutedReason !== undefined
        ? input.notExecutedReason
        : existing.notExecutedReason;
    if (nextWorkExecuted === false && (nextReason == null || nextReason.trim() === "")) {
      throw new BadRequestException({
        message: "A reason is required when work is not executed",
        code: "KONTROL_ALAT_REASON_REQUIRED",
      });
    }

    await prisma.kontrolAlat.update({
      where: { id: existing.id },
      data: {
        ...(input.workExecuted !== undefined ? { workExecuted: input.workExecuted } : {}),
        ...(input.notExecutedReason !== undefined
          ? { notExecutedReason: input.notExecutedReason }
          : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.visualPowerCable !== undefined
          ? { visualPowerCable: input.visualPowerCable }
          : {}),
        ...(input.visualDisplay !== undefined ? { visualDisplay: input.visualDisplay } : {}),
        ...(input.visualButtons !== undefined ? { visualButtons: input.visualButtons } : {}),
        ...(input.functionInitialOk !== undefined
          ? { functionInitialOk: input.functionInitialOk }
          : {}),
        ...(input.functionFinalOk !== undefined
          ? { functionFinalOk: input.functionFinalOk }
          : {}),
        ...(input.certificateNumber !== undefined
          ? { certificateNumber: input.certificateNumber }
          : {}),
        ...(existing.createdByUserId == null ? { createdByUserId: userId } : {}),
      },
    });

    return this.requireKontrolAlat(job.id);
  }

  async addAccessory(
    companyId: string,
    calibrationJobId: string,
    userId: string,
    input: KontrolAlatAccessoryCreateInput,
  ): Promise<KontrolAlatDetail> {
    const job = await this.requireSendToLabJob(companyId, calibrationJobId);
    const existing = await this.requireKontrolAlat(job.id);

    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const last = existing.accessories[existing.accessories.length - 1];
      sortOrder = (last?.sortOrder ?? 0) + 10;
    }

    await prisma.kontrolAlatAccessory.create({
      data: {
        kontrolAlatId: existing.id,
        label: input.label,
        sortOrder,
        present: input.present ?? null,
      },
    });
    await this.stampCreatedBy(existing.id, existing.createdByUserId, userId);

    return this.requireKontrolAlat(job.id);
  }

  async updateAccessory(
    companyId: string,
    calibrationJobId: string,
    accessoryId: string,
    input: KontrolAlatAccessoryUpdateInput,
  ): Promise<KontrolAlatDetail> {
    const job = await this.requireSendToLabJob(companyId, calibrationJobId);
    const existing = await this.requireKontrolAlat(job.id);
    const row = existing.accessories.find((item) => item.id === accessoryId);
    if (!row) {
      throw new NotFoundException({
        message: "Kontrol Alat accessory not found",
        code: "KONTROL_ALAT_ACCESSORY_NOT_FOUND",
      });
    }

    await prisma.kontrolAlatAccessory.update({
      where: { id: accessoryId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.present !== undefined ? { present: input.present } : {}),
      },
    });

    return this.requireKontrolAlat(job.id);
  }

  async removeAccessory(
    companyId: string,
    calibrationJobId: string,
    accessoryId: string,
  ): Promise<void> {
    const job = await this.requireSendToLabJob(companyId, calibrationJobId);
    const existing = await this.requireKontrolAlat(job.id);
    const row = existing.accessories.find((item) => item.id === accessoryId);
    if (!row) {
      throw new NotFoundException({
        message: "Kontrol Alat accessory not found",
        code: "KONTROL_ALAT_ACCESSORY_NOT_FOUND",
      });
    }

    await prisma.kontrolAlatAccessory.delete({ where: { id: accessoryId } });
  }

  async sign(
    companyId: string,
    calibrationJobId: string,
    userId: string,
    input: KontrolAlatSignatureCreateInput,
  ): Promise<KontrolAlatDetail> {
    const job = await this.requireSendToLabJob(companyId, calibrationJobId);
    const existing = await this.requireKontrolAlat(job.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      throw new BadRequestException({
        message: "Signer user was not found",
        code: "KONTROL_ALAT_SIGNER_NOT_FOUND",
      });
    }
    // KontrolAlatSignature.signerName is required, but User.name is nullable
    // (a user may not have set a display name yet) — fall back to their
    // email, which User always has, rather than writing an empty string.
    const signerName = user.name ?? user.email;

    const signerKind = input.signerKind as KontrolAlatSignerKind;
    const signedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.kontrolAlatSignature.upsert({
        where: {
          kontrolAlatId_signerKind: { kontrolAlatId: existing.id, signerKind },
        },
        create: {
          companyId: job.companyId,
          kontrolAlatId: existing.id,
          signerKind,
          signerUserId: user.id,
          signerName,
          signedAt,
        },
        update: {
          signerUserId: user.id,
          signerName,
          signedAt,
        },
      });

      const signatures = await tx.kontrolAlatSignature.findMany({
        where: { kontrolAlatId: existing.id },
      });
      const bothSigned =
        signatures.some(
          (row) => row.signerKind === "ADMINISTRATION" && row.signedAt != null,
        ) &&
        signatures.some(
          (row) => row.signerKind === "TECHNICAL_OFFICER" && row.signedAt != null,
        );

      const data: Prisma.KontrolAlatUpdateInput = {};
      if (bothSigned && existing.completedAt == null) {
        data.completedAt = signedAt;
      }
      if (existing.createdByUserId == null) {
        data.createdBy = { connect: { id: user.id } };
      }
      if (Object.keys(data).length > 0) {
        await tx.kontrolAlat.update({ where: { id: existing.id }, data });
      }
    });

    return this.requireKontrolAlat(job.id);
  }

  private async requireSendToLabJob(
    companyId: string,
    calibrationJobId: string,
  ): Promise<JobForKontrolAlat> {
    const job = await prisma.calibrationJob.findFirst({
      where: { id: calibrationJobId, companyId },
      select: {
        id: true,
        companyId: true,
        workOrder: { select: { id: true, serviceMode: true } },
      },
    });
    if (!job) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    if (job.workOrder.serviceMode !== "SEND_TO_LAB") {
      throw new BadRequestException({
        message: "Kontrol Alat is only applicable to In Lab (SEND_TO_LAB) work orders",
        code: "KONTROL_ALAT_NOT_APPLICABLE",
      });
    }
    return job;
  }

  private async requireKontrolAlat(calibrationJobId: string): Promise<KontrolAlatDetail> {
    const row = await prisma.kontrolAlat.findUnique({
      where: { calibrationJobId },
      include: kontrolAlatInclude,
    });
    if (!row) {
      throw new NotFoundException({
        message: "Kontrol Alat not found",
        code: "KONTROL_ALAT_NOT_FOUND",
      });
    }
    return row;
  }

  private async stampCreatedBy(
    kontrolAlatId: string,
    createdByUserId: string | null,
    userId: string,
  ): Promise<void> {
    if (createdByUserId != null) return;
    await prisma.kontrolAlat.update({
      where: { id: kontrolAlatId },
      data: { createdByUserId: userId },
    });
  }

  private async assertCertificateNumberAllowed(
    companyId: string,
    calibrationJobId: string,
  ): Promise<void> {
    const approved = await prisma.qualityReview.findFirst({
      where: { companyId, calibrationJobId, status: "APPROVED" },
      select: { id: true },
    });
    if (!approved) {
      throw new BadRequestException({
        message: "Certificate number can be entered only after MT approval",
        code: "KONTROL_ALAT_CERTIFICATE_NOT_ALLOWED",
      });
    }
  }
}
