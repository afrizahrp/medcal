"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  CustomerCreateInput,
  CustomerListQuery,
  CustomerUpdateInput,
  LeadConvertInput,
} from "@medcal/shared";
import type { CustomerListResponse, CustomerRow, LeadConvertResponse } from "./customers-ui";

export const CUSTOMERS_QUERY_KEY = "customers" as const;
export const LEAD_DETAIL_QUERY_KEY = "lead-detail" as const;

export interface CustomersQueryParams {
  search: string;
  status: CustomerListQuery["status"] | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

function buildCustomersSearchParams(params: CustomersQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.status) qs.set("status", params.status);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useCustomers(params: CustomersQueryParams) {
  return useQuery({
    queryKey: [
      CUSTOMERS_QUERY_KEY,
      params.search,
      params.status,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<CustomerListResponse>(
        `/customers?${buildCustomersSearchParams(params).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: [CUSTOMERS_QUERY_KEY, id],
    queryFn: () => apiFetch<CustomerRow>(`/customers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerCreateInput) =>
      apiFetch<CustomerRow>("/customers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: [CUSTOMERS_QUERY_KEY] });
      queryClient.setQueryData([CUSTOMERS_QUERY_KEY, customer.id], customer);
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomerUpdateInput }) =>
      apiFetch<CustomerRow>(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [CUSTOMERS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [CUSTOMERS_QUERY_KEY, variables.id] });
    },
  });
}

export function useConvertLeadToCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, input }: { leadId: string; input?: LeadConvertInput }) =>
      apiFetch<LeadConvertResponse>(`/leads/${leadId}/convert`, {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [CUSTOMERS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [LEAD_DETAIL_QUERY_KEY, result.lead.id] });
      queryClient.setQueryData([CUSTOMERS_QUERY_KEY, result.customer.id], result.customer);
    },
  });
}
