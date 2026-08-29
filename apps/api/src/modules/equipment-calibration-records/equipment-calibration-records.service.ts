import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import type {
  EquipmentCalibrationRecordCreateInput,
  EquipmentCalibrationRecordUpdateInput,
} from "@medcal/shared";
import {
  resolveCalibrationValidity,
  type CalibrationValidityResult,
} from "./calibration-validity";

const EQUIPMENT_CALIBRATION_OWNER_TYPE = "EQUIPMENT_CALIBRATION" as const;

const userSelect = { id: true, name: true, email: true } as const;

const recordSelect = {
  id: true,
  companyId: true,
  equipmentId: true,
  calibrationDate: true,
  validFrom: true,
  validUntil: true,
  certificateNumber: true,
  provider: true,
  result: true,
  remarks: true,
  acceptedForUse: true,
  acceptedByUserId: true,
  acceptedAt: true,
  acceptanceNotes: true,
  status: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  acceptedBy: { select: userSelect },
  createdBy: { select: userSelect },
} as const;

type RecordRow = Prisma.EquipmentCalibrationRecordGetPayload<{ select: typeof recordSelect }>;

export interface CalibrationDocument {
  id: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  createdAt: Date;
  uploadedByUserId: string | null;
}

export type CalibrationRecordWithDocuments = RecordRow & { documents: CalibrationDocument[] };

export interface CalibrationRecordListResult {
  data: CalibrationRecordWithDocuments[];
  /** Derived calibration validity for this Equipment unit as of "now". */
  validity: CalibrationValidityResult;
}

const LOCKED = new ConflictException({
  message: "This calibration record is confirmed and cannot be modified or deleted",
  code: "EQUIPMENT_CALIBRATION_RECORD_LOCKED",
});

@Injectable()
export class EquipmentCalibrationRecordsService {
  private async assertEquipmentInCompany(companyId: string, equipmentId: string): Promise<void> {
    const equipment = await prisma.equipment.findFirst({
      where: { id: equipmentId, companyId },
      select: { id: true },
    });
    if (!equipment) {
      throw new NotFoundException({ message: "Equipment not found", code: "EQUIPMENT_NOT_FOUND" });
    }
  }

  private async loadDocuments(companyId: string, recordIds: string[]): Promise<Map<string, CalibrationDocument[]>> {
    if (recordIds.length === 0) return new Map();
    const files = await prisma.fileObject.findMany({
      where: {
        companyId,
        ownerType: EQUIPMENT_CALIBRATION_OWNER_TYPE,
        ownerId: { in: recordIds },
      },
      select: {
        id: true,
        ownerId: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        checksum: true,
        createdAt: true,
        uploadedByUserId: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const byRecord = new Map<string, CalibrationDocument[]>();
    for (const f of files) {
      const list = byRecord.get(f.ownerId) ?? [];
      list.push({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        checksum: f.checksum,
        createdAt: f.createdAt,
        uploadedByUserId: f.uploadedByUserId,
      });
      byRecord.set(f.ownerId, list);
    }
    return byRecord;
  }

  private assertValidityWindow(
    validFrom: Date | null,
    calibrationDate: Date,
    validUntil: Date,
  ): void {
    const start = validFrom ?? calibrationDate;
    if (start.getTime() > validUntil.getTime()) {
      throw new ConflictException({
        message: "validFrom (or calibrationDate) must be on or before validUntil",
        code: "INVALID_CALIBRATION_VALIDITY_WINDOW",
      });
    }
  }

  private toValidityRecord(r: { id: string; status: RecordRow["status"]; calibrationDate: Date; validFrom: Date | null; validUntil: Date }) {
    return {
      id: r.id,
      status: r.status,
      calibrationDate: r.calibrationDate,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
    };
  }

  /** Reusable: is this Equipment unit calibration-valid as of an explicit date? */
  async getValidity(companyId: string, equipmentId: string, asOf: Date): Promise<CalibrationValidityResult> {
    await this.assertEquipmentInCompany(companyId, equipmentId);
    const records = await prisma.equipmentCalibrationRecord.findMany({
      where: { companyId, equipmentId },
      select: { id: true, status: true, calibrationDate: true, validFrom: true, validUntil: true },
    });
    return resolveCalibrationValidity(records.map((r) => this.toValidityRecord(r)), asOf);
  }

  async listForEquipment(companyId: string, equipmentId: string): Promise<CalibrationRecordListResult> {
    await this.assertEquipmentInCompany(companyId, equipmentId);
    const rows = await prisma.equipmentCalibrationRecord.findMany({
      where: { companyId, equipmentId },
      select: recordSelect,
      orderBy: [{ calibrationDate: "desc" }, { createdAt: "desc" }],
    });
    const docs = await this.loadDocuments(companyId, rows.map((r) => r.id));
    const data = rows.map((r) => ({ ...r, documents: docs.get(r.id) ?? [] }));
    const validity = resolveCalibrationValidity(
      rows.map((r) => this.toValidityRecord(r)),
      new Date(),
    );
    return { data, validity };
  }

  async findOne(companyId: string, id: string): Promise<CalibrationRecordWithDocuments> {
    const row = await prisma.equipmentCalibrationRecord.findFirst({
      where: { id, companyId },
      select: recordSelect,
    });
    if (!row) {
      throw new NotFoundException({
        message: "Calibration record not found",
        code: "EQUIPMENT_CALIBRATION_RECORD_NOT_FOUND",
      });
    }
    const docs = await this.loadDocuments(companyId, [id]);
    return { ...row, documents: docs.get(id) ?? [] };
  }

  async create(
    companyId: string,
    userId: string,
    equipmentId: string,
    input: EquipmentCalibrationRecordCreateInput,
  ): Promise<CalibrationRecordWithDocuments> {
    await this.assertEquipmentInCompany(companyId, equipmentId);
    this.assertValidityWindow(input.validFrom ?? null, input.calibrationDate, input.validUntil);
    const accepted = input.acceptedForUse === true;
    const created = await prisma.equipmentCalibrationRecord.create({
      data: {
        companyId,
        equipmentId,
        calibrationDate: input.calibrationDate,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil,
        certificateNumber: input.certificateNumber ?? null,
        provider: input.provider ?? null,
        result: input.result ?? null,
        remarks: input.remarks ?? null,
        acceptedForUse: accepted,
        acceptedByUserId: accepted ? userId : null,
        acceptedAt: accepted ? new Date() : null,
        acceptanceNotes: input.acceptanceNotes ?? null,
        status: "DRAFT",
        createdByUserId: userId,
      },
      select: { id: true },
    });
    return this.findOne(companyId, created.id);
  }

  async update(
    companyId: string,
    userId: string,
    id: string,
    input: EquipmentCalibrationRecordUpdateInput,
  ): Promise<CalibrationRecordWithDocuments> {
    const existing = await prisma.equipmentCalibrationRecord.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        calibrationDate: true,
        validFrom: true,
        validUntil: true,
        acceptedForUse: true,
      },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Calibration record not found",
        code: "EQUIPMENT_CALIBRATION_RECORD_NOT_FOUND",
      });
    }
    if (existing.status === "CONFIRMED") {
      // A confirmed record is historical evidence — no field, and no
      // status transition, is editable. Corrections use a new record.
      throw LOCKED;
    }

    // Validate resulting validity window.
    const nextCalibrationDate = input.calibrationDate ?? existing.calibrationDate;
    const nextValidFrom =
      input.validFrom !== undefined ? input.validFrom : existing.validFrom;
    const nextValidUntil = input.validUntil ?? existing.validUntil;
    this.assertValidityWindow(nextValidFrom, nextCalibrationDate, nextValidUntil);

    const data: Prisma.EquipmentCalibrationRecordUpdateInput = {};
    if (input.calibrationDate !== undefined) data.calibrationDate = input.calibrationDate;
    if (input.validFrom !== undefined) data.validFrom = input.validFrom;
    if (input.validUntil !== undefined) data.validUntil = input.validUntil;
    if (input.certificateNumber !== undefined) data.certificateNumber = input.certificateNumber;
    if (input.provider !== undefined) data.provider = input.provider;
    if (input.result !== undefined) data.result = input.result;
    if (input.remarks !== undefined) data.remarks = input.remarks;
    if (input.acceptanceNotes !== undefined) data.acceptanceNotes = input.acceptanceNotes;

    if (input.acceptedForUse !== undefined && input.acceptedForUse !== existing.acceptedForUse) {
      data.acceptedForUse = input.acceptedForUse;
      if (input.acceptedForUse) {
        data.acceptedBy = { connect: { id: userId } };
        data.acceptedAt = new Date();
      } else {
        data.acceptedBy = { disconnect: true };
        data.acceptedAt = null;
      }
    }

    if (input.status === "CONFIRMED") {
      data.status = "CONFIRMED";
    }

    await prisma.equipmentCalibrationRecord.update({ where: { id }, data });
    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<{ id: string; deleted: true }> {
    const existing = await prisma.equipmentCalibrationRecord.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Calibration record not found",
        code: "EQUIPMENT_CALIBRATION_RECORD_NOT_FOUND",
      });
    }
    if (existing.status === "CONFIRMED") {
      throw LOCKED;
    }
    // Refuse to orphan attached evidence: a DRAFT record's files must be
    // removed through the FilesModule first.
    const fileCount = await prisma.fileObject.count({
      where: { companyId, ownerType: EQUIPMENT_CALIBRATION_OWNER_TYPE, ownerId: id },
    });
    if (fileCount > 0) {
      throw new ConflictException({
        message: "Remove the attached certificate file(s) before deleting this record",
        code: "EQUIPMENT_CALIBRATION_RECORD_HAS_FILES",
      });
    }
    await prisma.equipmentCalibrationRecord.delete({ where: { id } });
    return { id, deleted: true };
  }
}
