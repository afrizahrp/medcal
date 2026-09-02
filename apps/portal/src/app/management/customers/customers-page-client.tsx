"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { useTableSort } from "@/hooks/use-table-sort";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../components/access-denied";
import {
  type CustomerStatus,
  CustomerEmptyState,
  CustomerFilters,
  CustomerTable,
  PageHeader,
  PaginationBar,
  Surface,
} from "./customers-ui";
import { useCustomers } from "./use-customers-query";

const URL_KEYS = ["search", "status", "sortBy", "sortDir", "page", "pageSize"] as const;

export default function CustomersPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const status: CustomerStatus | "" = (params.status as CustomerStatus | undefined) ?? "";
  const sort = useTableSort(params, setParams, "createdAt");
  const { sortBy, sortDir } = sort;
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;
  const committedSearch = params.search ?? "";

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 500);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const customersQuery = useCustomers({
    search: committedSearch,
    status,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  if (!capabilities?.customerRead) {
    return <AccessDenied />;
  }

  const result = customersQuery.data;
  const loading = customersQuery.isLoading;
  const fetching = customersQuery.isFetching && !loading;
  const forbidden = isForbidden(customersQuery.error);
  const error = customersQuery.isError && !forbidden ? "Gagal memuat daftar customer." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Customers"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Customers" }]}
        />

        {capabilities.customerCreate ? (
          <Button asChild className="shrink-0">
            <Link href="/customers/new">
              <Plus className="h-4 w-4" />
              Customer
            </Link>
          </Button>
        ) : null}
      </div>

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        <CustomerFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          status={status}
          onStatusChange={(next) => setParams({ status: next || undefined, page: undefined })}
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : result && result.data.length === 0 ? (
          <CustomerEmptyState
            onClearFilters={
              committedSearch || status
                ? () => {
                    setSearchInput("");
                    setParams({
                      search: undefined,
                      status: undefined,
                      page: undefined,
                    });
                  }
                : undefined
            }
          />
        ) : result ? (
          <>
            <div className="mt-4">
              <CustomerTable customers={result.data} sort={sort} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
              itemLabel="customer"
              onPageChange={(next) => setParams({ page: next <= 1 ? undefined : String(next) })}
              onPageSizeChange={(next) =>
                setParams({ pageSize: next === 10 ? undefined : String(next), page: undefined })
              }
            />
          </>
        ) : null}
      </Surface>
    </div>
  );
}
