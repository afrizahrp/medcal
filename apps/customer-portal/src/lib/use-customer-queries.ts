"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import { customerQueryKey } from "./customer-query";
import { feedbackPath, type CustomerFeedbackState } from "./customer-feedback";
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

/**
 * The Work Order's feedback state ({ eligible, submitted }) from its own
 * endpoint, so the work-order list path stays untouched. Server-derived on
 * every fetch.
 */
export function useWorkOrderFeedback(workOrderId: string) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: customerQueryKey(userId, "work-order-feedback", workOrderId),
    queryFn: () => apiFetch<CustomerFeedbackState>(feedbackPath(workOrderId)),
    enabled: Boolean(userId),
  });
}

/** Submits feedback; callers decide what to do with each error (see describeFeedbackSubmitError). */
export function useSubmitWorkOrderFeedback(workOrderId: string) {
  const userId = useSessionUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: number; comment?: string }) =>
      apiFetch<{ rating: number; submittedAt: string }>(feedbackPath(workOrderId), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: customerQueryKey(userId, "work-order-feedback", workOrderId) }),
  });
}
