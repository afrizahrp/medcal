import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { prisma, type CalibrationValueType } from "@medcal/db";
import { auth } from "@medcal/auth";
import { jobReferenceEquipmentUsedInclude } from "./job-reference-equipment";
import { LK_DOWNLOAD_ACTIONS, recordAuditLog } from "./audit-log";
import { formatDate, text } from "../work-orders/work-order-pdf-shared";
import { resolveLkManualHeader } from "./lk-manual-header-catalog";
import {
  renderLkResultPdf,
  type LkResultPdfEquipmentRow,
  type LkResultPdfPhysicalCheckRow,
  type LkResultPdfResult,
  type LkResultPdfRow,
  type LkResultPdfSection,
} from "./lk-result-pdf";
import type { LkMeasurementHit, LkTemplateData } from "./lk-template-data";
import { isBedSideMonitorTemplate } from "./lk-templates/bed-side-monitor";

/** Step-up token TTL — short-lived, single-use (LK Result PDF Download v1 §8). */
const REAUTH_TOKEN_TTL_MS = 5 * 60 * 1000;

export interface LkDownloadRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface LkDownloadReauthResult {
  token: string;
  expiresAt: Date;
}

/**
 * LK Result PDF Download v1 — orchestrates password step-up re-authentication
 * and the generic PDF build for one CalibrationJob. Deliberately narrow:
 * this service does NOT touch DeviceCapability / Certificate / Invoice /
 * Quality Review scoring — it only reads already-established data and
 * renders it through the generic renderer in lk-result-pdf.ts.
 */
@Injectable()
export class LkDownloadService {
  /**
   * Step 1 — verify the caller's CURRENT password against Better Auth's own
   * credential store (Account.password), then mint a short-lived, single-use,
   * job-scoped authorization token. Reuses Better Auth's own email/password
   * verification (`auth.api.signInEmail`) rather than a second password
   * system; any session Better Auth creates as a side effect of that call is
   * never propagated to the caller (no cookie/header is forwarded here).
   */
  async requestReauth(
    companyId: string,
    userId: string,
    userEmail: string,
    calibrationJobId: string,
    password: string,
    ctx: LkDownloadRequestContext,
  ): Promise<LkDownloadReauthResult> {
    const job = await this.requireFinalizedJob(companyId, calibrationJobId);

    let verified = false;
    try {
      await auth.api.signInEmail({ body: { email: userEmail, password } });
      verified = true;
    } catch {
      verified = false;
    }

    if (!verified) {
      await recordAuditLog({
        companyId,
        userId,
        action: LK_DOWNLOAD_ACTIONS.REAUTH,
        outcome: "FAILURE",
        targetType: "CalibrationJob",
        targetId: job.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException({
        message: "Invalid password",
        code: "LK_REAUTH_INVALID_PASSWORD",
      });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + REAUTH_TOKEN_TTL_MS);
    await prisma.lkDownloadAuthorization.create({
      data: { companyId, userId, calibrationJobId: job.id, token, expiresAt },
    });

    await recordAuditLog({
      companyId,
      userId,
      action: LK_DOWNLOAD_ACTIONS.REAUTH,
      outcome: "SUCCESS",
      targetType: "CalibrationJob",
      targetId: job.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { token, expiresAt };
  }

  /**
   * Step 2 — consume the single-use token (atomically, so two concurrent
   * downloads can never both succeed) and render the PDF from the job's
   * currently finalized attempt.
   */
  async downloadPdf(
    companyId: string,
    userId: string,
    calibrationJobId: string,
    token: string,
    ctx: LkDownloadRequestContext,
  ): Promise<LkResultPdfResult> {
    const consumed = await this.consumeToken(companyId, userId, calibrationJobId, token);
    if (!consumed) {
      await recordAuditLog({
        companyId,
        userId,
        action: LK_DOWNLOAD_ACTIONS.DOWNLOAD,
        outcome: "FAILURE",
        targetType: "CalibrationJob",
        targetId: calibrationJobId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException({
        message: "LK download authorization is missing, expired, or already used",
        code: "LK_DOWNLOAD_TOKEN_INVALID",
      });
    }

    const job = await this.requireFinalizedJob(companyId, calibrationJobId);
    const pdf = await this.buildPdf(companyId, job);

    await recordAuditLog({
      companyId,
      userId,
      action: LK_DOWNLOAD_ACTIONS.DOWNLOAD,
      outcome: "SUCCESS",
      targetType: "CalibrationJob",
      targetId: job.id,
      metadata: { filename: pdf.filename },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return pdf;
  }

  /** Atomically validate + single-use-consume a step-up token. */
  private async consumeToken(
    companyId: string,
    userId: string,
    calibrationJobId: string,
    token: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const row = await tx.lkDownloadAuthorization.findUnique({ where: { token } });
      if (
        !row ||
        row.companyId !== companyId ||
        row.userId !== userId ||
        row.calibrationJobId !== calibrationJobId ||
        row.usedAt !== null ||
        row.expiresAt.getTime() <= Date.now()
      ) {
        return false;
      }
      await tx.lkDownloadAuthorization.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return true;
    });
  }

  /** Company-scoped load + gate: only an ACCEPTED_BY_QA job may be downloaded. */
  private async requireFinalizedJob(
    companyId: string,
    calibrationJobId: string,
  ): Promise<{ id: string }> {
    const job = await prisma.calibrationJob.findFirst({
      where: { id: calibrationJobId, companyId },
      select: { id: true, status: true },
    });
    if (!job) {
      throw new NotFoundException({
        message: "Calibration job not found",
        code: "CALIBRATION_JOB_NOT_FOUND",
      });
    }
    if (job.status !== "ACCEPTED_BY_QA") {
      throw new BadRequestException({
        message: "LK can only be downloaded for a job accepted by QA",
        code: "CALIBRATION_JOB_NOT_FINALIZED",
      });
    }
    return job;
  }

  private async buildPdf(
    companyId: string,
    job: { id: string },
  ): Promise<LkResultPdfResult> {
    const [company, fullJob] = await Promise.all([
      prisma.company.findFirst({
        where: { id: companyId },
        select: { id: true, name: true, legalName: true },
      }),
      prisma.calibrationJob.findFirst({
        where: { id: job.id, companyId },
        select: {
          id: true,
          unitOrdinal: true,
          unitTotal: true,
          currentAttempt: true,
          startedAt: true,
          submittedAt: true,
          technicianObservedSerial: true,
          device: {
            select: {
              deviceTypeId: true,
              brand: true,
              model: true,
              serialNumber: true,
              locationText: true,
            },
          },
          certificate: { select: { number: true } },
          kontrolAlat: { select: { certificateNumber: true, capacity: true } },
          workOrder: {
            select: {
              number: true,
              customer: { select: { name: true } },
              assignments: {
                select: { roleOnJob: true, technician: { select: { name: true } } },
                orderBy: { roleOnJob: "asc" },
              },
            },
          },
          calibrationRequestItem: {
            select: { deviceTypeId: true, deviceType: { select: { name: true } } },
          },
          purchaseOrderItem: {
            select: {
              device: { select: { brand: true, model: true, serialNumber: true, locationText: true } },
              quotationItem: {
                select: {
                  requestItem: {
                    select: {
                      deviceTypeId: true,
                      deviceType: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
          reviews: {
            select: {
              decision: true,
              status: true,
              notes: true,
              reviewedAt: true,
              reviewer: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
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

    const deviceTypeId =
      fullJob.device?.deviceTypeId ??
      fullJob.calibrationRequestItem?.deviceTypeId ??
      fullJob.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
      null;
    const deviceTypeName =
      fullJob.calibrationRequestItem?.deviceType.name ??
      fullJob.purchaseOrderItem?.quotationItem?.requestItem?.deviceType.name ??
      null;
    const linkedDevice = fullJob.device ?? fullJob.purchaseOrderItem?.device ?? null;

    const [equipmentUsedRows, physicalCheckRows, capabilitySections, physicalCatalog, measurementHits] =
      await Promise.all([
        prisma.jobReferenceEquipmentUsed.findMany({
          where: { calibrationJobId: fullJob.id },
          include: jobReferenceEquipmentUsedInclude,
          orderBy: { createdAt: "asc" },
        }),
        prisma.physicalCheckResult.findMany({
          where: { companyId, calibrationJobId: fullJob.id, attemptNumber: fullJob.currentAttempt },
          include: { devicePhysicalCheckItem: { select: { name: true, sortOrder: true } } },
          orderBy: [{ devicePhysicalCheckItem: { sortOrder: "asc" } }, { recordedAt: "asc" }],
        }),
        deviceTypeId
          ? this.buildCapabilitySections(companyId, fullJob.id, deviceTypeId, fullJob.currentAttempt)
          : [],
        deviceTypeId
          ? prisma.devicePhysicalCheckItem.findMany({
              where: { deviceTypeId, isActive: true },
              select: { id: true, name: true, inspectionLimit: true, sortOrder: true },
              orderBy: { sortOrder: "asc" },
            })
          : Promise.resolve([]),
        this.loadTemplateMeasurements(companyId, fullJob.id, fullJob.currentAttempt),
      ]);

    const equipmentUsed: LkResultPdfEquipmentRow[] = equipmentUsedRows.map((row) => ({
      equipmentTypeName: row.equipment.equipmentType.name,
      brand: row.equipment.brand,
      model: row.equipment.model,
      serialNumber: row.equipment.serialNumber,
    }));

    const physicalChecks: LkResultPdfPhysicalCheckRow[] = physicalCheckRows.map((row) => ({
      name: row.devicePhysicalCheckItem.name,
      inspectionLimitSnapshot: row.inspectionLimitSnapshot,
      verdict: row.verdict,
      note: row.note,
    }));

    const latestReview = fullJob.reviews[0] ?? null;
    const formHeader = resolveLkManualHeader(deviceTypeName);
    const lead = fullJob.workOrder.assignments.find((a) => a.roleOnJob === "LEAD") ?? fullJob.workOrder.assignments[0];
    const dataEntry = measurementHits.find((m) => m.recordedByName)?.recordedByName ?? null;

    const templateData: LkTemplateData | undefined = isBedSideMonitorTemplate(formHeader.sourceFile)
      ? {
          identity: {
            certificateNumber:
              text(fullJob.certificate?.number) ?? text(fullJob.kontrolAlat?.certificateNumber) ?? "",
            deviceName: text(deviceTypeName) ?? "",
            assetNumber: "",
            brand: text(linkedDevice?.brand) ?? "",
            owner: fullJob.workOrder.customer.name,
            model: text(linkedDevice?.model) ?? "",
            room: text(fullJob.device?.locationText) ?? text(linkedDevice?.locationText) ?? "",
            serial: text(fullJob.technicianObservedSerial) ?? text(linkedDevice?.serialNumber) ?? "",
            receivedDate: fullJob.startedAt ? formatDate(fullJob.startedAt) : "",
            calibrationDate: fullJob.startedAt ? formatDate(fullJob.startedAt) : "",
            capacity: text(fullJob.kontrolAlat?.capacity) ?? "",
            resolution: "",
          },
          equipmentUsed: equipmentUsedRows.map((row) => ({
            name: row.equipment.equipmentType.name,
            brand: row.equipment.brand ?? "",
            model: row.equipment.model ?? "",
            serialNumber: row.equipment.serialNumber ?? "",
          })),
          physicalItems: physicalCatalog.map((item) => {
            const result = physicalCheckRows.find(
              (row) => row.devicePhysicalCheckItem.name === item.name,
            );
            return {
              name: item.name,
              inspectionLimit: result?.inspectionLimitSnapshot || item.inspectionLimit,
              verdict: result?.verdict ?? null,
            };
          }),
          measurements: measurementHits.map(({ recordedByName: _n, ...hit }) => hit),
          technicianName: text(lead?.technician.name) ?? "",
          dataEntryName: text(dataEntry) ?? "",
        }
      : undefined;

    return renderLkResultPdf({
      company,
      formHeader,
      templateData,
      job: {
        id: fullJob.id,
        unitOrdinal: fullJob.unitOrdinal,
        unitTotal: fullJob.unitTotal,
        currentAttempt: fullJob.currentAttempt,
        startedAt: fullJob.startedAt,
        submittedAt: fullJob.submittedAt,
        workOrderNumber: fullJob.workOrder.number,
        customerName: fullJob.workOrder.customer.name,
        deviceTypeName,
        deviceBrand: linkedDevice?.brand ?? null,
        deviceModel: linkedDevice?.model ?? null,
        deviceSerial: linkedDevice?.serialNumber ?? null,
      },
      qualityReview: latestReview
        ? {
            decision: latestReview.decision,
            status: latestReview.status,
            reviewerName: latestReview.reviewer.name,
            reviewedAt: latestReview.reviewedAt,
            notes: latestReview.notes,
          }
        : null,
      equipmentUsed,
      physicalChecks,
      capabilitySections,
      generatedAt: new Date(),
    });
  }

  /**
   * Generic measurement-results renderer input: CalibrationJob → DeviceType →
   * DeviceCapability → DeviceCalibrationParameter/CalibrationTestPoint →
   * MeasurementResult, grouped by capability. No device-specific branching.
   */
  private async buildCapabilitySections(
    companyId: string,
    calibrationJobId: string,
    deviceTypeId: string,
    attemptNumber: number,
  ): Promise<LkResultPdfSection[]> {
    const [jobFreeze, parameters, capabilityOrders, results] = await Promise.all([
      prisma.calibrationJob.findFirst({
        where: { id: calibrationJobId, companyId },
        select: { measurementTestPointsSnapshottedAt: true },
      }),
      prisma.deviceCalibrationParameter.findMany({
        where: { deviceTypeId, isActive: true },
        select: {
          id: true,
          name: true,
          valueType: true,
          decimalPlaces: true,
          toleranceMin: true,
          toleranceMax: true,
          toleranceNote: true,
          uom: { select: { symbol: true, code: true } },
          capabilityItem: {
            select: { capability: { select: { id: true, name: true } } },
          },
          testPoints: {
            where: { isActive: true },
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              sequence: true,
              settingLabel: true,
              toleranceMin: true,
              toleranceMax: true,
              toleranceNote: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.deviceTypeCapabilityOrder.findMany({
        where: { deviceTypeId },
        select: { capabilityId: true, sortOrder: true },
      }),
      prisma.measurementResult.findMany({
        where: { companyId, calibrationJobId, attemptNumber },
        select: {
          deviceCalibrationParameterId: true,
          calibrationTestPointId: true,
          replicateIndex: true,
          measuredValue: true,
          measuredBool: true,
          measuredText: true,
        },
        orderBy: { replicateIndex: "asc" },
      }),
    ]);

    const frozenPoints =
      jobFreeze?.measurementTestPointsSnapshottedAt != null
        ? await prisma.jobCalibrationTestPoint.findMany({
            where: { calibrationJobId },
            orderBy: { sequence: "asc" },
            select: {
              deviceCalibrationParameterId: true,
              sourceCalibrationTestPointId: true,
              sequence: true,
              settingLabel: true,
              toleranceMin: true,
              toleranceMax: true,
              toleranceNote: true,
            },
          })
        : null;
    const frozenByParameterId = new Map<string, NonNullable<typeof frozenPoints>>();
    if (frozenPoints) {
      for (const row of frozenPoints) {
        const list = frozenByParameterId.get(row.deviceCalibrationParameterId) ?? [];
        list.push(row);
        frozenByParameterId.set(row.deviceCalibrationParameterId, list);
      }
    }

    const sortOrderByCapabilityId = new Map(
      capabilityOrders.map((row) => [row.capabilityId, row.sortOrder] as const),
    );

    const resultsByKey = new Map<string, typeof results>();
    for (const result of results) {
      const key = `${result.deviceCalibrationParameterId}:${result.calibrationTestPointId ?? "none"}`;
      const bucket = resultsByKey.get(key);
      if (bucket) bucket.push(result);
      else resultsByKey.set(key, [result]);
    }

    const sectionsById = new Map<string, { name: string; sortOrder: number; rows: LkResultPdfRow[] }>();

    for (const parameter of parameters) {
      const capability = parameter.capabilityItem.capability;
      const unit = parameter.uom?.symbol ?? parameter.uom?.code ?? null;

      const catalogPoints =
        frozenPoints != null
          ? (frozenByParameterId.get(parameter.id) ?? []).map((tp) => ({
              id: tp.sourceCalibrationTestPointId,
              sequence: tp.sequence,
              settingLabel: tp.settingLabel,
              toleranceMin: tp.toleranceMin,
              toleranceMax: tp.toleranceMax,
              toleranceNote: tp.toleranceNote,
            }))
          : parameter.testPoints;

      const points =
        catalogPoints.length > 0
          ? catalogPoints.map((tp) => ({
              key: `${parameter.id}:${tp.id}`,
              label: `${parameter.name} — ${tp.settingLabel}`,
              toleranceMin: tp.toleranceMin ?? parameter.toleranceMin,
              toleranceMax: tp.toleranceMax ?? parameter.toleranceMax,
              toleranceNote: tp.toleranceNote ?? parameter.toleranceNote,
            }))
          : [
              {
                key: `${parameter.id}:none`,
                label: unit ? `${parameter.name} (${unit})` : parameter.name,
                toleranceMin: parameter.toleranceMin,
                toleranceMax: parameter.toleranceMax,
                toleranceNote: parameter.toleranceNote,
              },
            ];

      for (const point of points) {
        const matched = resultsByKey.get(point.key) ?? [];
        const values = matched
          .map((r) => formatMeasuredValue(r, parameter.valueType, parameter.decimalPlaces))
          .filter((v): v is string => v !== null);

        const row: LkResultPdfRow = {
          label: point.label,
          value: values.length > 0 ? values.join(", ") : "—",
          toleranceText: formatToleranceText(point.toleranceMin, point.toleranceMax, point.toleranceNote),
        };

        const existing = sectionsById.get(capability.id);
        if (existing) {
          existing.rows.push(row);
        } else {
          sectionsById.set(capability.id, {
            name: capability.name,
            sortOrder: sortOrderByCapabilityId.get(capability.id) ?? Number.MAX_SAFE_INTEGER,
            rows: [row],
          });
        }
      }
    }

    return Array.from(sectionsById.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((section) => ({ capabilityName: section.name, rows: section.rows }));
  }

  private async loadTemplateMeasurements(
    companyId: string,
    calibrationJobId: string,
    attemptNumber: number,
  ): Promise<Array<LkMeasurementHit & { recordedByName: string | null }>> {
    const rows = await prisma.measurementResult.findMany({
      where: { companyId, calibrationJobId, attemptNumber },
      select: {
        replicateIndex: true,
        measuredValue: true,
        measuredBool: true,
        measuredText: true,
        recordedBy: { select: { name: true } },
        parameter: { select: { code: true, valueType: true, decimalPlaces: true } },
        testPoint: { select: { settingLabel: true, settingValue: true } },
      },
      orderBy: { replicateIndex: "asc" },
    });
    return rows.map((row) => ({
      parameterCode: row.parameter.code,
      settingLabel: row.testPoint?.settingLabel ?? "",
      settingValue: toNum(row.testPoint?.settingValue),
      replicateIndex: row.replicateIndex,
      formattedValue: formatMeasuredValue(row, row.parameter.valueType, row.parameter.decimalPlaces) ?? "",
      recordedByName: row.recordedBy?.name ?? null,
    }));
  }
}

/** Safe Prisma.Decimal (or number/string) → number, without assuming a coercion path. */
export function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "object" && value !== null && "toString" in value
      ? (value as { toString: () => string }).toString()
      : String(value);
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

export function formatMeasuredValue(
  row: { measuredValue: unknown; measuredBool: boolean | null; measuredText: string | null },
  valueType: CalibrationValueType,
  decimalPlaces: number | null,
): string | null {
  if (valueType === "BOOLEAN") {
    return row.measuredBool === null ? null : row.measuredBool ? "Ya" : "Tidak";
  }
  if (valueType === "TEXT" || valueType === "RATIO") {
    if (row.measuredText) return row.measuredText;
    const num = toNum(row.measuredValue);
    return num !== null ? String(num) : null;
  }
  const num = toNum(row.measuredValue);
  if (num === null) return null;
  return decimalPlaces != null ? num.toFixed(decimalPlaces) : String(num);
}

export function formatToleranceText(min: unknown, max: unknown, note: string | null): string | null {
  if (note && note.trim()) return note.trim();
  const minNum = toNum(min);
  const maxNum = toNum(max);
  if (minNum !== null && maxNum !== null) return `${minNum} – ${maxNum}`;
  if (minNum !== null) return `≥ ${minNum}`;
  if (maxNum !== null) return `≤ ${maxNum}`;
  return null;
}
