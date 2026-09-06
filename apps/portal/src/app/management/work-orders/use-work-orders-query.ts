"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchBlob } from "@medcal/shared";
import type {
  WorkOrderAssignInput,
  WorkOrderCreateBody,
  WorkOrderEquipmentReplaceInput,
  WorkOrderUpdateBody,
} from "@medcal/shared";
import { PURCHASE_ORDERS_QUERY_KEY } from "../purchase-orders/use-purchase-orders-query";
import type {
  WorkOrderEquipmentProposalResponse,
  WorkOrderListResponse,
  WorkOrderRow,
  WorkOrderStatus,
} from "./work-orders-ui";

interface WorkOrderEquipmentReplaceResponse {
  workOrder: WorkOrderRow;
  warnings: Array<{ code: string; equipmentId: string; message: string }>;
}

export const WORK_ORDERS_QUERY_KEY = "work-orders" as const;

export interface WorkOrdersQueryParams {
  search: string;
  status: WorkOrderStatus | "";
  purchaseOrderId?: string;
  quotationId?: string;
  customerId?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface AssignableUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  membership: { role: string } | null;
}

interface UserListResponse {
  data: AssignableUser[];
}

function buildSearchParams(params: WorkOrdersQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.status) qs.set("status", params.status);
  if (params.purchaseOrderId) qs.set("purchaseOrderId", params.purchaseOrderId);
  if (params.quotationId) qs.set("quotationId", params.quotationId);
  if (params.customerId) qs.set("customerId", params.customerId);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

function invalidateWorkOrderQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: string,
) {
  queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_QUERY_KEY] });
  if (id) {
    queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_QUERY_KEY, id] });
  }
  queryClient.invalidateQueries({ queryKey: [PURCHASE_ORDERS_QUERY_KEY] });
}

export function useWorkOrders(params: WorkOrdersQueryParams, enabled = true) {
  return useQuery({
    queryKey: [
      WORK_ORDERS_QUERY_KEY,
      params.search,
      params.status,
      params.purchaseOrderId,
      params.quotationId,
      params.customerId,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<WorkOrderListResponse>(`/work-orders?${buildSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useWorkOrder(id: string | undefined) {
  return useQuery({
    queryKey: [WORK_ORDERS_QUERY_KEY, id],
    queryFn: () => apiFetch<WorkOrderRow>(`/work-orders/${id}`),
    enabled: Boolean(id),
    // Near-real-time reflection of field activity (Identity Correction BA
    // status on the items table) — poll while focused, and refetch on focus.
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkOrderCreateBody) =>
      apiFetch<WorkOrderRow>("/work-orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      invalidateWorkOrderQueries(queryClient, data.id);
      queryClient.setQueryData([WORK_ORDERS_QUERY_KEY, data.id], data);
    },
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: WorkOrderUpdateBody }) =>
      apiFetch<WorkOrderRow>(`/work-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidateWorkOrderQueries(queryClient, variables.id);
    },
  });
}

export function useAssignWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: WorkOrderAssignInput }) =>
      apiFetch<WorkOrderRow>(`/work-orders/${id}/assign`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidateWorkOrderQueries(queryClient, variables.id);
    },
  });
}

export function useStartWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<WorkOrderRow>(`/work-orders/${id}/start`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateWorkOrderQueries(queryClient, id);
    },
  });
}

export function useDoneWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<WorkOrderRow>(`/work-orders/${id}/done`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateWorkOrderQueries(queryClient, id);
    },
  });
}

export function useCancelWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<WorkOrderRow>(`/work-orders/${id}/cancel`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateWorkOrderQueries(queryClient, id);
    },
  });
}

export function useWorkOrderEquipmentProposal(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [WORK_ORDERS_QUERY_KEY, id, "equipment-proposal"],
    queryFn: () =>
      apiFetch<WorkOrderEquipmentProposalResponse>(`/work-orders/${id}/equipment-proposal`),
    enabled: Boolean(id) && enabled,
  });
}

export function useReplaceWorkOrderEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: WorkOrderEquipmentReplaceInput }) =>
      apiFetch<WorkOrderEquipmentReplaceResponse>(`/work-orders/${id}/equipment`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidateWorkOrderQueries(queryClient, variables.id);
      queryClient.invalidateQueries({
        queryKey: [WORK_ORDERS_QUERY_KEY, variables.id, "equipment-proposal"],
      });
    },
  });
}

export function useConfirmWorkOrderEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<WorkOrderRow>(`/work-orders/${id}/equipment/confirm`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateWorkOrderQueries(queryClient, id);
    },
  });
}

/**
 * Persist the drag-and-drop order of one WorkOrder's actual equipment.
 * `equipmentIds` is the COMPLETE reordered Equipment-id list. Optimistically
 * reorders the cached work order, rolls back to the snapshot on failure, and
 * refetches on settle so the server order is authoritative.
 */
export function useReorderWorkOrderEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, equipmentIds }: { id: string; equipmentIds: string[] }) =>
      apiFetch<WorkOrderRow>(`/work-orders/${id}/equipment/order`, {
        method: "PATCH",
        body: JSON.stringify({ equipmentIds }),
      }),
    onMutate: async ({ id, equipmentIds }) => {
      const key = [WORK_ORDERS_QUERY_KEY, id];
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<WorkOrderRow>(key);
      if (snapshot) {
        const byEquipmentId = new Map(snapshot.equipment.map((row) => [row.equipment.id, row]));
        const reordered = equipmentIds
          .map((equipmentId) => byEquipmentId.get(equipmentId))
          .filter((row): row is (typeof snapshot.equipment)[number] => Boolean(row))
          .map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 }));
        if (reordered.length === snapshot.equipment.length) {
          queryClient.setQueryData<WorkOrderRow>(key, { ...snapshot, equipment: reordered });
        }
      }
      return { key, snapshot };
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshot) queryClient.setQueryData(context.key, context.snapshot);
    },
    onSettled: (_data, _error, variables) => {
      invalidateWorkOrderQueries(queryClient, variables.id);
    },
  });
}

/** Issue the "Surat Jalan Alat" (DLN) for an ON_SITE work order. Idempotent. */
export function useIssueDeliveryNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/work-orders/${id}/delivery-note`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateWorkOrderQueries(queryClient, id);
    },
  });
}

export async function openDeliveryNotePdf(workOrderId: string, filename?: string): Promise<void> {
  const blob = await apiFetchBlob(`/work-orders/${workOrderId}/delivery-note/pdf`);
  if (blob.size === 0) throw new Error("Empty delivery note PDF");
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (filename) anchor.download = filename;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useAssignableUsers(enabled = true) {
  return useQuery({
    queryKey: [WORK_ORDERS_QUERY_KEY, "assignable-users"],
    queryFn: () => apiFetch<UserListResponse>("/users?status=ACTIVE&pageSize=100"),
    enabled,
  });
}

export async function fetchWorkOrderPdf(id: string): Promise<Blob> {
  const blob = await apiFetchBlob(`/work-orders/${id}/pdf`);
  if (blob.size === 0) {
    throw new Error("Empty work order PDF");
  }
  return blob;
}

export async function openWorkOrderPdf(id: string, filename?: string): Promise<void> {
  const blob = await fetchWorkOrderPdf(id);
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (filename) anchor.download = filename;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
