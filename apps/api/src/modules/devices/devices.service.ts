import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MasterCodeService, prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  DEVICE_SORTABLE_FIELDS,
  type DeviceCreateInput,
  type DeviceListQuery,
  type DeviceUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = { id: true, code: true, name: true } as const;
const customerSelect = { id: true, number: true, name: true } as const;

const deviceInclude = {
  deviceType: { select: deviceTypeSelect },
  customer: { select: customerSelect },
} as const;

export type DeviceWithRelations = Prisma.DeviceGetPayload<{
  include: typeof deviceInclude;
}>;

export interface DeviceListResult {
  data: DeviceWithRelations[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

@Injectable()
export class DevicesService {
  private async assertDeviceTypeExists(deviceTypeId: string): Promise<void> {
    const deviceType = await prisma.deviceType.findUnique({ where: { id: deviceTypeId } });
    if (!deviceType) {
      throw new BadRequestException({
        message: "Device type not found",
        code: "DEVICE_TYPE_NOT_FOUND",
      });
    }
  }

  private async assertCustomerInCompany(companyId: string, customerId: string): Promise<void> {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) {
      throw new BadRequestException({
        message: "Customer not found",
        code: "CUSTOMER_NOT_FOUND",
      });
    }
  }

  /**
   * Create a physical Device. `code` is a system-issued, immutable business
   * identifier (DVC-000001), allocated in the same transaction as the insert so
   * both commit together.
   *
   * Pass `tx` to enlist in a caller's transaction (e.g. CalibrationJob
   * register-and-assign, which must atomically create the device and bind it to
   * the job). When omitted, a local transaction is opened.
   */
  async create(
    companyId: string,
    input: DeviceCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DeviceWithRelations> {
    await this.assertDeviceTypeExists(input.deviceTypeId);
    await this.assertCustomerInCompany(companyId, input.customerId);

    const run = async (client: Prisma.TransactionClient): Promise<DeviceWithRelations> => {
      const code = await MasterCodeService.allocate({ entity: "DEVICE", companyId, tx: client });
      return client.device.create({
        data: {
          companyId,
          code,
          customerId: input.customerId,
          deviceTypeId: input.deviceTypeId,
          brand: emptyToNull(input.brand) ?? undefined,
          model: emptyToNull(input.model) ?? undefined,
          serialNumber: emptyToNull(input.serialNumber) ?? undefined,
          category: emptyToNull(input.category) ?? undefined,
          locationText: emptyToNull(input.locationText) ?? undefined,
          ...(input.status ? { status: input.status } : {}),
        },
        include: deviceInclude,
      });
    };

    return tx ? run(tx) : prisma.$transaction(run);
  }

  async findAll(companyId: string, query: DeviceListQuery): Promise<DeviceListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.DeviceWhereInput = {
      companyId,
      ...(query.deviceTypeId ? { deviceTypeId: query.deviceTypeId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { brand: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
              { serialNumber: { contains: query.search, mode: "insensitive" } },
              { deviceType: { name: { contains: query.search, mode: "insensitive" } } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      DEVICE_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.device.count({ where }),
      prisma.device.findMany({
        where,
        include: deviceInclude,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<DeviceWithRelations> {
    const device = await prisma.device.findFirst({
      where: { id, companyId },
      include: deviceInclude,
    });
    if (!device) {
      throw new NotFoundException({
        message: "Device not found",
        code: "DEVICE_NOT_FOUND",
      });
    }
    return device;
  }

  async update(
    companyId: string,
    id: string,
    input: DeviceUpdateInput,
  ): Promise<DeviceWithRelations> {
    const existing = await this.findOne(companyId, id);

    if (input.deviceTypeId !== undefined && input.deviceTypeId !== existing.deviceTypeId) {
      await this.assertDeviceTypeExists(input.deviceTypeId);
    }

    if (input.customerId !== undefined && input.customerId !== existing.customerId) {
      await this.assertCustomerInCompany(companyId, input.customerId);
    }

    // `code` is immutable and system-issued — deviceUpdateSchema does not accept
    // it and it is never written here.
    return prisma.device.update({
      where: { id: existing.id },
      data: {
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.deviceTypeId !== undefined ? { deviceTypeId: input.deviceTypeId } : {}),
        ...(input.brand !== undefined ? { brand: emptyToNull(input.brand) } : {}),
        ...(input.model !== undefined ? { model: emptyToNull(input.model) } : {}),
        ...(input.serialNumber !== undefined
          ? { serialNumber: emptyToNull(input.serialNumber) }
          : {}),
        ...(input.category !== undefined ? { category: emptyToNull(input.category) } : {}),
        ...(input.locationText !== undefined
          ? { locationText: emptyToNull(input.locationText) }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: deviceInclude,
    });
  }

  async remove(companyId: string, id: string): Promise<DeviceWithRelations> {
    const existing = await this.findOne(companyId, id);

    const [requestItems, quotationItems, purchaseOrderItems, calibrationJobs, certificates] =
      await Promise.all([
        prisma.calibrationRequestItem.count({ where: { deviceId: id } }),
        prisma.quotationItem.count({ where: { deviceId: id } }),
        prisma.purchaseOrderItem.count({ where: { deviceId: id } }),
        prisma.calibrationJob.count({ where: { deviceId: id } }),
        prisma.certificate.count({ where: { deviceId: id } }),
      ]);

    if (requestItems + quotationItems + purchaseOrderItems + calibrationJobs + certificates > 0) {
      throw new BadRequestException({
        message: "Cannot delete a device that is still referenced by business records",
        code: "DEVICE_IN_USE",
      });
    }

    await prisma.device.delete({ where: { id: existing.id } });
    return existing;
  }
}
