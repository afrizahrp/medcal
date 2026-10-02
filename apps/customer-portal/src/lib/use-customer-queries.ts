"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import { customerQueryKey } from "./customer-query";
import {
  jobListPath,
  unitGroupListPath,
  workOrderListPath,
  type CustomerJob,
  type CustomerPage,
  type CustomerUnitGroupPage,
  type CustomerWorkOrderSummary,
  type JobListParams,
  type UnitGroupListParams,
  type WorkOrderListParams,
} from "./customer-work-orders";
import { useSessionUserId } from "./session";

/**
 * Customer data queries. Every key carries the signed-in user's id, every
 * filter is part of the key, and nothing runs until a session exists, so a
 * result is only ever reused for the same user and the same search/filters.
 * The server derives the customer from the session — no customer id is sent.
 */
export function useWorkOrderList(params: WorkOrderListParams) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: customerQueryKey(userId, "work-orders", params),
    queryFn: () => apiFetch<CustomerPage<CustomerWorkOrderSummary>>(workOrderListPath(params)),
    enabled: Boolean(userId),
    // Keep the previous page on screen (dimmed) while a new search/filter loads.
    placeholderData: (previous) => previous,
  });
}

export function useWorkOrder(workOrderId: string) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: customerQueryKey(userId, "work-order", workOrderId),
    queryFn: () =>
      apiFetch<CustomerWorkOrderSummary>(`/customer/work-orders/${encodeURIComponent(workOrderId)}`),
    enabled: Boolean(userId),
  });
}

export function useWorkOrderJobs(workOrderId: string, params: JobListParams) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: customerQueryKey(userId, "work-order-jobs", workOrderId, params),
    queryFn: () => apiFetch<CustomerPage<CustomerJob>>(jobListPath(workOrderId, params)),
    enabled: Boolean(userId),
    placeholderData: (previous) => previous,
  });
}

/** The Work Order's units grouped by order line, after search/filters. */
export function useWorkOrderUnitGroups(workOrderId: string, params: UnitGroupListParams) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: customerQueryKey(userId, "work-order-unit-groups", workOrderId, params),
    queryFn: () => apiFetch<CustomerUnitGroupPage>(unitGroupListPath(workOrderId, params)),
    enabled: Boolean(userId),
    placeholderData: (previous) => previous,
  });
}
