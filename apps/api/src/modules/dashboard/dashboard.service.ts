import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { DashboardQuery, DashboardSummaryResponse } from "@medcal/shared";
import {
  DashboardPeriodError,
  countByBucket,
  resolveDashboardPeriod,
  type DashboardBucket,
} from "./dashboard-period";

/**
 * V1 financial cards are a named constant. Do not query Invoice, Payment,
 * CreditNote, or Certificate billing fields to manufacture this zero.
 */
export const FINANCIAL_CARDS_V1 = {
  revenue: 0,
  outstandingInvoiceValue: 0,
  unavailableReason:
    "Penagihan belum diimplementasikan. Angka ini tidak dihitung dari purchase order, quotation, atau invoice.",
} as const;

const ACTIVE_WORK_ORDER_STATUSES = ["PLANNED", "ASSIGNED", "IN_PROGRESS"] as const;
const JOBS_AWAITING_ACTION_STATUSES = ["PENDING", "IN_PROGRESS", "SUBMITTED", "REWORK"] as const;
const QUOTATIONS_PENDING_STATUSES = ["DRAFT", "SENT"] as const;

@Injectable()
export class DashboardService {
  async managementSummary(companyId: string, query: DashboardQuery): Promise<DashboardSummaryResponse> {
    if (query.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: query.customerId, companyId },
        select: { id: true },
      });
      if (!customer) {
        throw new NotFoundException({
          message: "Customer not found",
          code: "CUSTOMER_NOT_FOUND",
        });
      }
    }

    let period;
    try {
      period = resolveDashboardPeriod({
        period: query.period,
        from: query.from,
        to: query.to,
      });
    } catch (error) {
      if (error instanceof DashboardPeriodError) {
        throw new BadRequestException({
          message: error.message,
          code: "INVALID_DASHBOARD_QUERY",
        });
      }
      throw error;
    }

    const customerId = query.customerId;
    const range = { gte: period.start, lt: period.end };

    const [
      activeWorkOrders,
      jobsAwaitingAction,
      quotationsPendingApproval,
      purchaseOrders,
      jobs,
      reviews,
    ] = await Promise.all([
      prisma.workOrder.count({
        where: {
          companyId,
          status: { in: [...ACTIVE_WORK_ORDER_STATUSES] },
          ...(customerId ? { customerId } : {}),
        },
      }),
      prisma.calibrationJob.count({
        where: {
          companyId,
          status: { in: [...JOBS_AWAITING_ACTION_STATUSES] },
          ...(customerId ? { workOrder: { customerId } } : {}),
        },
      }),
      prisma.quotation.count({
        where: {
          companyId,
          status: { in: [...QUOTATIONS_PENDING_STATUSES] },
          ...(customerId ? { customerId } : {}),
        },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          companyId,
          status: "APPROVED",
          confirmedAt: range,
          ...(customerId ? { customerId } : {}),
        },
        select: { confirmedAt: true },
      }),
      prisma.calibrationJob.findMany({
        where: {
          companyId,
          createdAt: range,
          ...(customerId ? { workOrder: { customerId } } : {}),
        },
        select: { createdAt: true },
      }),
      prisma.qualityReview.findMany({
        where: {
          companyId,
          status: "APPROVED",
          reviewedAt: range,
          calibrationJob: {
            status: "ACCEPTED_BY_QA",
            ...(customerId ? { workOrder: { customerId } } : {}),
          },
        },
        select: { calibrationJobId: true, reviewedAt: true },
        orderBy: { reviewedAt: "asc" },
      }),
    ]);

    const customerPoTimestamps = purchaseOrders.flatMap((row) =>
      row.confirmedAt ? [row.confirmedAt] : [],
    );
    const calibratedTimestamps = distinctApprovedReviewTimestamps(reviews);

    return {
      currentState: {
        activeWorkOrders,
        jobsAwaitingAction,
        quotationsPendingApproval,
      },
      period: {
        range: {
          preset: period.preset,
          from: period.from,
          to: period.to,
          timezone: period.timezone,
        },
        customerPO: series(customerPoTimestamps, period.buckets),
        volume: series(
          jobs.map((row) => row.createdAt),
          period.buckets,
        ),
        calibrated: series(calibratedTimestamps, period.buckets),
      },
      financial: { ...FINANCIAL_CARDS_V1 },
    };
  }
}

function series(timestamps: Date[], buckets: DashboardBucket[]) {
  const counts = countByBucket(timestamps, buckets);
  return {
    total: timestamps.length,
    trend: buckets.map((bucket, index) => ({
      bucketStart: bucket.start.toISOString(),
      label: bucket.label,
      count: counts[index] ?? 0,
    })),
  };
}

function distinctApprovedReviewTimestamps(
  reviews: { calibrationJobId: string; reviewedAt: Date | null }[],
): Date[] {
  const seen = new Set<string>();
  const timestamps: Date[] = [];
  for (const review of reviews) {
    if (!review.reviewedAt || seen.has(review.calibrationJobId)) continue;
    seen.add(review.calibrationJobId);
    timestamps.push(review.reviewedAt);
  }
  return timestamps;
}
