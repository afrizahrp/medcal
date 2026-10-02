import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";
import type { CalibrationJobStatus } from "@medcal/db";
import type {
  CustomerJobListQuery,
  CustomerUnitGroupListQuery,
  CustomerWorkOrderListQuery,
} from "@medcal/shared";
import { FilesService } from "../files/files.service";
import { recordAuditLog } from "../calibration-jobs/audit-log";
import {
  JOB_STATUSES_BY_CUSTOMER_STATUS,
  WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS,
  computeCustomerProgress,
  customerJobStatus,
  customerWorkOrderStatus,
  progressBucket,
  summarizeGroupCounts,
  toCertificateView,
  toUnitIdentity,
  unitGroupKey,
  type CustomerCertificateView,
  type CustomerJobStatus,
  type CustomerProgress,
  type CustomerProgressBucket,
  type CustomerUnitIdentity,
  type CustomerWorkOrderStatus,
  type JobStatusCounts,
} from "./customer-progress";

const CERTIFICATE_OWNER_TYPE = "CERTIFICATE" as const;
const DEFAULT_WORK_ORDER_PAGE_SIZE = 10;
const DEFAULT_JOB_PAGE_SIZE = 20;
const DEFAULT_GROUP_PAGE_SIZE = 10;

export interface CustomerJobView {
  id: string;
  unitOrdinal: number;
  unitTotal: number;
  status: CustomerJobStatus;
  identity: CustomerUnitIdentity;
  certificate: CustomerCertificateView;
}

export interface CustomerWorkOrderSummary {
  id: string;
  number: string;
  status: CustomerWorkOrderStatus;
  progress: CustomerProgress;
  certificates: { availableCount: number };
}

/**
 * One order line's units, as the parent row of the grouped unit list. Counts
 * cover only the units matching the active search/filters. `unit` is filled for
 * a group of exactly one unit so the client can show it as a plain card without
 * a second request.
 */
export interface CustomerUnitGroup {
  key: string;
  name: string | null;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  availableCertificates: number;
  unit: CustomerJobView | null;
}

export interface CustomerUnitGroupPage extends CustomerPage<CustomerUnitGroup> {
  /** Matching units across all groups, not just this page's. */
  totalUnits: number;
}

export interface CustomerPage<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CustomerPortalRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

const ACCESS_DENIED = () =>
  new ForbiddenException({ code: "CUSTOMER_ACCESS_REQUIRED", message: "Forbidden" });

const WORK_ORDER_NOT_FOUND = () =>
  new NotFoundException({ code: "WORK_ORDER_NOT_FOUND", message: "Work order not found" });

const JOB_NOT_FOUND = () =>
  new NotFoundException({ code: "CALIBRATION_JOB_NOT_FOUND", message: "Calibration job not found" });

const PDF_UNAVAILABLE = () =>
  new NotFoundException({
    code: "CERTIFICATE_PDF_UNAVAILABLE",
    message: "No PDF is available for this certificate",
  });

/** An ISSUED certificate whose PDF is stored — what the portal counts as "available". */
const availableCertificateWhere = {
  is: { status: "ISSUED", pdfFileObjectId: { not: null } },
} satisfies Prisma.CertificateNullableScalarRelationFilter;

const workOrderSelect = {
  id: true,
  number: true,
  status: true,
  items: { select: { qty: true } },
} satisfies Prisma.WorkOrderSelect;

const jobSelect = {
  id: true,
  unitOrdinal: true,
  unitTotal: true,
  status: true,
  customerDeclaredDeviceName: true,
  technicianObservedBrand: true,
  technicianObservedModel: true,
  technicianObservedSerial: true,
  device: {
    select: {
      brand: true,
      model: true,
      serialNumber: true,
      deviceType: { select: { name: true } },
    },
  },
  certificate: {
    select: { status: true, number: true, issuedAt: true, pdfFileObjectId: true },
  },
} satisfies Prisma.CalibrationJobSelect;

type WorkOrderRow = Prisma.WorkOrderGetPayload<{ select: typeof workOrderSelect }>;
type JobRow = Prisma.CalibrationJobGetPayload<{ select: typeof jobSelect }>;

interface WorkOrderAggregate {
  statusCounts: JobStatusCounts;
  availableCertificates: number;
}

function totalItemQty(items: ReadonlyArray<{ qty: Prisma.Decimal }>): number {
  return items.reduce((sum, item) => sum.plus(item.qty), new Prisma.Decimal(0)).toNumber();
}

function toJobView(job: JobRow): CustomerJobView {
  return {
    id: job.id,
    unitOrdinal: job.unitOrdinal,
    unitTotal: job.unitTotal,
    status: customerJobStatus(job.status),
    identity: toUnitIdentity(job),
    certificate: toCertificateView(job.certificate),
  };
}

function toSummary(workOrder: WorkOrderRow, aggregate: WorkOrderAggregate | undefined): CustomerWorkOrderSummary {
  return {
    id: workOrder.id,
    number: workOrder.number,
    status: customerWorkOrderStatus(workOrder.status),
    progress: computeCustomerProgress({
      itemQtyTotal: totalItemQty(workOrder.items),
      statusCounts: aggregate?.statusCounts ?? {},
    }),
    certificates: { availableCount: aggregate?.availableCertificates ?? 0 },
  };
}

function toPage<T>(data: T[], total: number, page: number, pageSize: number): CustomerPage<T> {
  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * The customer-visible fields a search term may match on a unit: the device
 * as the customer or technician named it, its brand/model/serial, and the
 * number of an issued certificate. Nothing else is searchable.
 */
function unitSearchWhere(term: string): Prisma.CalibrationJobWhereInput {
  const contains = { contains: term, mode: "insensitive" as const };
  return {
    OR: [
      { customerDeclaredDeviceName: contains },
      { technicianObservedBrand: contains },
      { technicianObservedModel: contains },
      { technicianObservedSerial: contains },
      {
        device: {
          is: {
            OR: [
              { brand: contains },
              { model: contains },
              { serialNumber: contains },
              { deviceType: { name: contains } },
            ],
          },
        },
      },
      { certificate: { is: { status: "ISSUED", number: contains } } },
    ],
  };
}

/** Status / certificate / search filters shared by the flat unit list and the grouped one. */
function unitFilters(query: CustomerUnitGroupListQuery): Prisma.CalibrationJobWhereInput[] {
  const and: Prisma.CalibrationJobWhereInput[] = [];
  if (query.status) {
    and.push({ status: { in: [...JOB_STATUSES_BY_CUSTOMER_STATUS[query.status]] as CalibrationJobStatus[] } });
  }
  if (query.certificate === "AVAILABLE") and.push({ certificate: availableCertificateWhere });
  if (query.search) and.push(unitSearchWhere(query.search));
  return and;
}

/** Matches units on any of the given order lines; `null` is the "no order line" group. */
function lineWhere(lineIds: Array<string | null>): Prisma.CalibrationJobWhereInput {
  const real = lineIds.filter((id): id is string => id !== null);
  return {
    OR: [
      ...(real.length > 0 ? [{ purchaseOrderItemId: { in: real } }] : []),
      ...(lineIds.includes(null) ? [{ purchaseOrderItemId: null }] : []),
    ],
  };
}

/**
 * Read-only customer view of WorkOrder → CalibrationJob → Certificate.
 *
 * Scope is the authenticated user's CustomerUserLink, never a client-supplied
 * customerId. An ACTIVE company membership is also required — the same gate
 * GET /me already applies — so a removed membership cannot keep reading
 * through a leftover link. Resource ownership is WorkOrder.customerId. Search,
 * filters and pagination are only ever applied on top of that scope.
 */
@Injectable()
export class CustomerPortalService {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  private companyId(): string {
    const companyId = process.env.COMPANY_ID;
    if (!companyId) throw ACCESS_DENIED();
    return companyId;
  }

  /** The single customer this user is linked to, or the same denial for every failure. */
  private async requireCustomerId(userId: string): Promise<{ companyId: string; customerId: string }> {
    const companyId = this.companyId();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") throw ACCESS_DENIED();

    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { userId: true },
    });
    if (!membership) throw ACCESS_DENIED();

    const link = await prisma.customerUserLink.findFirst({
      where: { userId, customer: { companyId } },
      select: { customerId: true },
    });
    if (!link) throw ACCESS_DENIED();
    return { companyId, customerId: link.customerId };
  }

  /** Job counts per status and available-certificate counts for the given Work Orders (two grouped queries). */
  private async aggregate(workOrderIds: string[]): Promise<Map<string, WorkOrderAggregate>> {
    const result = new Map<string, WorkOrderAggregate>();
    if (workOrderIds.length === 0) return result;

    const [statusRows, certificateRows] = await Promise.all([
      prisma.calibrationJob.groupBy({
        by: ["workOrderId", "status"],
        where: { workOrderId: { in: workOrderIds } },
        _count: { _all: true },
      }),
      prisma.calibrationJob.groupBy({
        by: ["workOrderId"],
        where: { workOrderId: { in: workOrderIds }, certificate: availableCertificateWhere },
        _count: { _all: true },
      }),
    ]);

    const entry = (id: string): WorkOrderAggregate => {
      let existing = result.get(id);
      if (!existing) {
        existing = { statusCounts: {}, availableCertificates: 0 };
        result.set(id, existing);
      }
      return existing;
    };
    for (const row of statusRows) entry(row.workOrderId).statusCounts[row.status] = row._count._all;
    for (const row of certificateRows) entry(row.workOrderId).availableCertificates = row._count._all;
    return result;
  }

  /** Ids of the customer's Work Orders that fall in a progress bucket (jobs completed / jobs total). */
  private async progressWhere(
    scope: { companyId: string; customerId: string },
    bucket: CustomerProgressBucket,
  ): Promise<Prisma.WorkOrderWhereInput> {
    const rows = await prisma.calibrationJob.groupBy({
      by: ["workOrderId", "status"],
      where: { companyId: scope.companyId, workOrder: { customerId: scope.customerId } },
      _count: { _all: true },
    });
    const totals = new Map<string, number>();
    const completed = new Map<string, number>();
    for (const row of rows) {
      totals.set(row.workOrderId, (totals.get(row.workOrderId) ?? 0) + row._count._all);
      if (customerJobStatus(row.status) === "COMPLETED") {
        completed.set(row.workOrderId, (completed.get(row.workOrderId) ?? 0) + row._count._all);
      }
    }
    if (bucket === "NONE_COMPLETED") {
      // Includes Work Orders with no jobs yet.
      return { id: { notIn: [...completed.keys()] } };
    }
    const ids = [...totals.entries()]
      .filter(([id, total]) => progressBucket(completed.get(id) ?? 0, total) === bucket)
      .map(([id]) => id);
    return { id: { in: ids } };
  }

  private async workOrderWhere(
    scope: { companyId: string; customerId: string },
    query: CustomerWorkOrderListQuery,
  ): Promise<Prisma.WorkOrderWhereInput> {
    const and: Prisma.WorkOrderWhereInput[] = [];
    if (query.status) {
      and.push({ status: { in: [...WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS[query.status]] } });
    }
    if (query.certificate === "AVAILABLE") {
      and.push({ jobs: { some: { certificate: availableCertificateWhere } } });
    }
    if (query.search) {
      and.push({
        OR: [
          { number: { contains: query.search, mode: "insensitive" } },
          { jobs: { some: unitSearchWhere(query.search) } },
        ],
      });
    }
    if (query.progress) and.push(await this.progressWhere(scope, query.progress));
    return { companyId: scope.companyId, customerId: scope.customerId, AND: and };
  }

  private async findOwnedWorkOrder(userId: string, workOrderId: string) {
    const { companyId, customerId } = await this.requireCustomerId(userId);
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId, customerId },
      select: workOrderSelect,
    });
    if (!workOrder) throw WORK_ORDER_NOT_FOUND();
    return { workOrder, companyId, customerId };
  }

  private async findOwnedJob(userId: string, jobId: string) {
    const { companyId, customerId } = await this.requireCustomerId(userId);
    const job = await prisma.calibrationJob.findFirst({
      where: { id: jobId, companyId, workOrder: { customerId } },
      select: {
        ...jobSelect,
        certificate: {
          select: {
            id: true,
            status: true,
            number: true,
            issuedAt: true,
            pdfFileObjectId: true,
            source: true,
          },
        },
      },
    });
    if (!job) throw JOB_NOT_FOUND();
    return { ...job, companyId };
  }

  async listWorkOrders(
    userId: string,
    query: CustomerWorkOrderListQuery = {},
  ): Promise<CustomerPage<CustomerWorkOrderSummary>> {
    const scope = await this.requireCustomerId(userId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_WORK_ORDER_PAGE_SIZE;
    const where = await this.workOrderWhere(scope, query);

    const [total, rows] = await Promise.all([
      prisma.workOrder.count({ where }),
      prisma.workOrder.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: workOrderSelect,
      }),
    ]);
    const aggregates = await this.aggregate(rows.map((row) => row.id));
    return toPage(
      rows.map((row) => toSummary(row, aggregates.get(row.id))),
      total,
      page,
      pageSize,
    );
  }

  async getWorkOrder(userId: string, workOrderId: string): Promise<CustomerWorkOrderSummary> {
    const { workOrder } = await this.findOwnedWorkOrder(userId, workOrderId);
    const aggregates = await this.aggregate([workOrder.id]);
    return toSummary(workOrder, aggregates.get(workOrder.id));
  }

  /** Resolves an opaque group key to its order line, only among the lines of a Work Order the caller owns. */
  private async resolveGroupLine(
    companyId: string,
    workOrderId: string,
    key: string,
  ): Promise<{ found: boolean; lineId: string | null }> {
    const lines = await prisma.calibrationJob.groupBy({
      by: ["purchaseOrderItemId"],
      where: { companyId, workOrderId },
    });
    const match = lines.find((line) => unitGroupKey(workOrderId, line.purchaseOrderItemId) === key);
    return match ? { found: true, lineId: match.purchaseOrderItemId } : { found: false, lineId: null };
  }

  async listJobs(
    userId: string,
    workOrderId: string,
    query: CustomerJobListQuery = {},
  ): Promise<CustomerPage<CustomerJobView>> {
    const { workOrder, companyId, customerId } = await this.findOwnedWorkOrder(userId, workOrderId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_JOB_PAGE_SIZE;

    const and = unitFilters(query);
    if (query.group) {
      const line = await this.resolveGroupLine(companyId, workOrder.id, query.group);
      // An unknown key is an empty group, not an error: it says nothing about other Work Orders.
      if (!line.found) return toPage([], 0, page, pageSize);
      and.push(lineWhere([line.lineId]));
    }
    const where: Prisma.CalibrationJobWhereInput = {
      companyId,
      workOrderId: workOrder.id,
      workOrder: { customerId },
      AND: and,
    };

    const [total, rows] = await Promise.all([
      prisma.calibrationJob.count({ where }),
      prisma.calibrationJob.findMany({
        where,
        orderBy: query.group
          ? [{ unitOrdinal: "asc" }, { id: "asc" }]
          : [{ customerDeclaredDeviceName: "asc" }, { unitOrdinal: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: jobSelect,
      }),
    ]);
    return toPage(rows.map(toJobView), total, page, pageSize);
  }

  /**
   * The Work Order's units grouped by order line, after search and filters.
   * Groups are built from three grouped queries over the matching units (status
   * counts, available certificates, declared names) - never one row per unit -
   * then sorted by name and paginated. All of it stays inside the owned Work
   * Order, so a group can only ever contain this customer's units.
   */
  async listUnitGroups(
    userId: string,
    workOrderId: string,
    query: CustomerUnitGroupListQuery = {},
  ): Promise<CustomerUnitGroupPage> {
    const { workOrder, companyId, customerId } = await this.findOwnedWorkOrder(userId, workOrderId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_GROUP_PAGE_SIZE;

    const and = unitFilters(query);
    const where: Prisma.CalibrationJobWhereInput = {
      companyId,
      workOrderId: workOrder.id,
      workOrder: { customerId },
      AND: and,
    };

    const [statusRows, certificateRows, nameRows] = await Promise.all([
      prisma.calibrationJob.groupBy({
        by: ["purchaseOrderItemId", "status"],
        where,
        _count: { _all: true },
      }),
      prisma.calibrationJob.groupBy({
        by: ["purchaseOrderItemId"],
        where: { ...where, AND: [...and, { certificate: availableCertificateWhere }] },
        _count: { _all: true },
      }),
      prisma.calibrationJob.groupBy({
        by: ["purchaseOrderItemId", "customerDeclaredDeviceName"],
        where: { ...where, AND: [...and, { customerDeclaredDeviceName: { not: null } }] },
      }),
    ]);

    const lineOf = (id: string | null) => id ?? "";
    const statusCounts = new Map<string, JobStatusCounts>();
    for (const row of statusRows) {
      const counts = statusCounts.get(lineOf(row.purchaseOrderItemId)) ?? {};
      counts[row.status] = row._count._all;
      statusCounts.set(lineOf(row.purchaseOrderItemId), counts);
    }
    const availableCertificates = new Map(
      certificateRows.map((row) => [lineOf(row.purchaseOrderItemId), row._count._all]),
    );
    // Smallest declared name per line, matching how the flat list is ordered.
    const declaredNames = new Map<string, string>();
    for (const row of nameRows) {
      const name = row.customerDeclaredDeviceName?.trim();
      if (!name) continue;
      const current = declaredNames.get(lineOf(row.purchaseOrderItemId));
      if (current === undefined || name < current) declaredNames.set(lineOf(row.purchaseOrderItemId), name);
    }

    // Lines where nobody declared a name fall back to the device-type name.
    const unnamed = [...statusCounts.keys()].filter((line) => !declaredNames.has(line));
    const fallbackNames = new Map<string, string>();
    if (unnamed.length > 0) {
      const rows = await prisma.calibrationJob.findMany({
        where: {
          ...where,
          AND: [...and, lineWhere(unnamed.map((line) => (line === "" ? null : line))), { device: { isNot: null } }],
        },
        distinct: ["purchaseOrderItemId"],
        orderBy: [{ purchaseOrderItemId: "asc" }, { unitOrdinal: "asc" }],
        select: { purchaseOrderItemId: true, device: { select: { deviceType: { select: { name: true } } } } },
      });
      for (const row of rows) {
        const name = row.device?.deviceType.name.trim();
        if (name) fallbackNames.set(lineOf(row.purchaseOrderItemId), name);
      }
    }

    const groups = [...statusCounts.entries()].map(([line, counts]) => {
      const lineId = line === "" ? null : line;
      return {
        line,
        lineId,
        key: unitGroupKey(workOrder.id, lineId),
        name: declaredNames.get(line) ?? fallbackNames.get(line) ?? null,
        ...summarizeGroupCounts(counts),
        availableCertificates: availableCertificates.get(line) ?? 0,
      };
    });
    groups.sort((a, b) => {
      if (a.name === null && b.name !== null) return 1;
      if (a.name !== null && b.name === null) return -1;
      return (a.name ?? "").localeCompare(b.name ?? "", "id") || a.key.localeCompare(b.key);
    });

    const totalUnits = groups.reduce((sum, group) => sum + group.total, 0);
    const pageGroups = groups.slice((page - 1) * pageSize, page * pageSize);

    // A group of one unit is shown as a plain card, so its unit comes along.
    const singles = pageGroups.filter((group) => group.total === 1);
    const singleUnits = new Map<string, CustomerJobView>();
    if (singles.length > 0) {
      const rows = await prisma.calibrationJob.findMany({
        where: { ...where, AND: [...and, lineWhere(singles.map((group) => group.lineId))] },
        select: { ...jobSelect, purchaseOrderItemId: true },
      });
      for (const row of rows) singleUnits.set(lineOf(row.purchaseOrderItemId), toJobView(row));
    }

    return {
      ...toPage(
        pageGroups.map(({ line, lineId: _lineId, ...group }) => ({
          ...group,
          unit: group.total === 1 ? (singleUnits.get(line) ?? null) : null,
        })),
        groups.length,
        page,
        pageSize,
      ),
      totalUnits,
    };
  }

  async getJob(userId: string, jobId: string): Promise<CustomerJobView> {
    const job = await this.findOwnedJob(userId, jobId);
    return toJobView(job);
  }

  async getCertificate(userId: string, jobId: string): Promise<CustomerCertificateView> {
    const job = await this.findOwnedJob(userId, jobId);
    return toCertificateView(job.certificate);
  }

  async openCertificatePdf(userId: string, jobId: string, ctx: CustomerPortalRequestContext) {
    const job = await this.findOwnedJob(userId, jobId);
    const certificate = job.certificate;
    if (!certificate || certificate.status !== "ISSUED" || !certificate.pdfFileObjectId) {
      throw PDF_UNAVAILABLE();
    }
    const { stream, fileObject } = await this.files.getForAuthorizedRead(
      job.companyId,
      certificate.pdfFileObjectId,
      CERTIFICATE_OWNER_TYPE,
      certificate.id,
    );
    await recordAuditLog({
      companyId: job.companyId,
      userId,
      action: "CERTIFICATE_PDF_VIEWED_VIA_CUSTOMER_PORTAL",
      outcome: "SUCCESS",
      targetType: "Certificate",
      targetId: certificate.id,
      metadata: {
        certificateId: certificate.id,
        certificateNumber: certificate.number,
        calibrationJobId: job.id,
        source: certificate.source,
        fileObjectId: fileObject.id,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return {
      stream,
      mimeType: fileObject.mimeType ?? "application/pdf",
      filename: `${certificate.number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`,
    };
  }
}

export type { CustomerCertificateView, CustomerUnitIdentity } from "./customer-progress";
