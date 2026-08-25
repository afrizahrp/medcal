import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentNumberService, prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  CALIBRATION_REQUEST_SORTABLE_FIELDS,
  type CalibrationRequestCreateInput,
  type CalibrationRequestListQuery,
  type CalibrationRequestUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

export type CalibrationRequestWithItems = Prisma.CalibrationRequestGetPayload<{
  include: { items: { include: { device: true } }; customer: true };
}>;

export interface CalibrationRequestListResult {
  data: CalibrationRequestWithItems[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class CalibrationRequestsService {
  async create(
    companyId: string,
    input: CalibrationRequestCreateInput,
  ): Promise<CalibrationRequestWithItems> {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, companyId },
      });
      if (!customer) {
        throw new BadRequestException({
          message: "Customer not found",
          code: "CUSTOMER_NOT_FOUND",
        });
      }

      if (input.leadId) {
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, companyId },
        });
        if (!lead) {
          throw new BadRequestException({
            message: "Lead not found",
            code: "LEAD_NOT_FOUND",
          });
        }
      }

      const deviceIds = input.items.map((item) => item.deviceId);
      const devices = await tx.device.findMany({
        where: { id: { in: deviceIds }, companyId },
      });
      if (devices.length !== deviceIds.length) {
        throw new BadRequestException({
          message: "One or more devices not found",
          code: "DEVICE_NOT_FOUND",
        });
      }

      const issuedAt = new Date();
      const number = await DocumentNumberService.allocate({
        companyId,
        documentType: "CALIBRATION_REQUEST",
        issuedAt,
        tx,
      });

      const calibrationRequest = await tx.calibrationRequest.create({
        data: {
          companyId,
          customerId: input.customerId,
          number,
          leadId: input.leadId,
          serviceMode: input.serviceMode,
          expectedDate: input.expectedDate,
          status: "DRAFT",
          notes: input.notes,
        },
      });

      await tx.calibrationRequestItem.createMany({
        data: input.items.map((item) => ({
          companyId,
          requestId: calibrationRequest.id,
          deviceId: item.deviceId,
          notes: item.notes,
        })),
      });

      return tx.calibrationRequest.findFirstOrThrow({
        where: { id: calibrationRequest.id, companyId },
        include: { items: { include: { device: true } }, customer: true },
      });
    });
  }

  async findAll(
    companyId: string,
    query: CalibrationRequestListQuery,
  ): Promise<CalibrationRequestListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CalibrationRequestWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: "insensitive" } },
              { notes: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      CALIBRATION_REQUEST_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.calibrationRequest.count({ where }),
      prisma.calibrationRequest.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: { include: { device: true } }, customer: true },
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<CalibrationRequestWithItems> {
    const calibrationRequest = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
      include: { items: { include: { device: true } }, customer: true },
    });
    if (!calibrationRequest) {
      throw new NotFoundException({
        message: "Calibration request not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }
    return calibrationRequest;
  }

  async update(
    companyId: string,
    id: string,
    input: CalibrationRequestUpdateInput,
  ): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Calibration request not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    // TODO: Full edit-permission business rules need confirmation. Currently
    // only allowing edits while status is DRAFT (the initial state).
    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Cannot update calibration request that is not in DRAFT status",
        code: "INVALID_STATUS_FOR_UPDATE",
      });
    }

    return prisma.$transaction(async (tx) => {
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, companyId },
        });
        if (!customer) {
          throw new BadRequestException({
            message: "Customer not found",
            code: "CUSTOMER_NOT_FOUND",
          });
        }
      }

      if (input.leadId) {
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, companyId },
        });
        if (!lead) {
          throw new BadRequestException({
            message: "Lead not found",
            code: "LEAD_NOT_FOUND",
          });
        }
      }

      if (input.items) {
        const deviceIds = input.items.map((item) => item.deviceId);
        const devices = await tx.device.findMany({
          where: { id: { in: deviceIds }, companyId },
        });
        if (devices.length !== deviceIds.length) {
          throw new BadRequestException({
            message: "One or more devices not found",
            code: "DEVICE_NOT_FOUND",
          });
        }

        await tx.calibrationRequestItem.deleteMany({
          where: { requestId: id },
        });

        await tx.calibrationRequestItem.createMany({
          data: input.items.map((item) => ({
            companyId,
            requestId: id,
            deviceId: item.deviceId,
            notes: item.notes,
          })),
        });
      }

      await tx.calibrationRequest.update({
        where: { id },
        data: {
          ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
          ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
          ...(input.serviceMode !== undefined ? { serviceMode: input.serviceMode } : {}),
          ...(input.expectedDate !== undefined ? { expectedDate: input.expectedDate } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });

      return tx.calibrationRequest.findFirstOrThrow({
        where: { id, companyId },
        include: { items: { include: { device: true } }, customer: true },
      });
    });
  }

  async cancel(companyId: string, id: string): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Calibration request not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    if (existing.status === "CANCELLED") {
      throw new BadRequestException({
        message: "Calibration request is already cancelled",
        code: "ALREADY_CANCELLED",
      });
    }

    if (existing.status === "FULFILLED") {
      throw new BadRequestException({
        message: "Cannot cancel a fulfilled calibration request",
        code: "CANNOT_CANCEL_FULFILLED",
      });
    }

    // TODO: Status transition to IN_QUOTATION will be triggered from the
    // Quotation module when it's implemented. This module only handles
    // DRAFT -> SUBMITTED and any status -> CANCELLED transitions.

    return prisma.calibrationRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { items: { include: { device: true } }, customer: true },
    });
  }

  async submit(companyId: string, id: string): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Calibration request not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Only DRAFT calibration requests can be submitted",
        code: "INVALID_STATUS_FOR_SUBMIT",
      });
    }

    return prisma.calibrationRequest.update({
      where: { id },
      data: { status: "SUBMITTED" },
      include: { items: { include: { device: true } }, customer: true },
    });
  }
}
