"use client";

import { useEffect, useState } from "react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../components/access-denied";
import {
  type PurchaseOrderStatus,
  PageHeader,
  PaginationBar,
  PurchaseOrderEmptyState,
  PurchaseOrderFilters,
  PurchaseOrderTable,
  Surface,
} from "./purchase-orders-ui";
import { usePurchaseOrders } from "./use-purchase-orders-query";

const URL_KEYS = ["search", "status", "sortBy", "sortDir", "page", "pageSize"] as const;

export default function PurchaseOrdersPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const status: PurchaseOrderStatus | "" = (params.status as PurchaseOrderStatus | undefined) ?? "";
  const sortBy = params.sortBy ?? "createdAt";
  const sortDir = (params.sortDir as "asc" | "desc" | undefined) ?? "desc";
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

  const query = usePurchaseOrders({
    search: committedSearch,
    status,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  const result = query.data;
  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar purchase order." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (!capabilities?.purchaseOrderRead || forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader
        title="Purchase Orders"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { label: "Purchase Orders" },
        ]}
      />

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        <PurchaseOrderFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          status={status}
          onStatusChange={(next) => setParams({ status: next || undefined, page: undefined })}
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : result && result.data.length === 0 ? (
          <PurchaseOrderEmptyState
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
              <PurchaseOrderTable purchaseOrders={result.data} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
              itemLabel="purchase order"
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
