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
import { PageHeader, Surface, TaxFilters, TaxTable, TaxEmptyState, PaginationBar } from "./tax-ui";
import { useTaxes } from "./use-tax-query";

const URL_KEYS = ["search", "isActive", "sortBy", "sortDir", "page", "pageSize"] as const;

export default function TaxPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const sort = useTableSort(params, setParams, "createdAt");
  const { sortBy, sortDir } = sort;
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;
  const committedSearch = params.search ?? "";
  const isActive: boolean | "" =
    params.isActive === "true" ? true : params.isActive === "false" ? false : "";

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 500);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const taxesQuery = useTaxes({
    search: committedSearch,
    isActive,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  if (!capabilities?.taxManage) {
    return <AccessDenied />;
  }

  const result = taxesQuery.data;
  const loading = taxesQuery.isLoading;
  const fetching = taxesQuery.isFetching && !loading;
  const forbidden = isForbidden(taxesQuery.error);
  const error = taxesQuery.isError && !forbidden ? "Gagal memuat daftar tax." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) {
    return <AccessDenied />;
  }

  const hasFilters = Boolean(committedSearch || isActive !== "");

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="Tax" crumbs={[{ href: "/", label: "Dashboard" }, { label: "Tax" }]} />

        <Button asChild className="shrink-0">
          <Link href="/tax/new">
            <Plus className="h-4 w-4" />
            Tax
          </Link>
        </Button>
      </div>

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        <TaxFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          isActive={isActive}
          onIsActiveChange={(next) =>
            setParams({
              isActive: next === "" ? undefined : String(next),
              page: undefined,
            })
          }
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : result && result.data.length === 0 ? (
          <TaxEmptyState
            onClearFilters={
              hasFilters
                ? () => {
                    setSearchInput("");
                    setParams({
                      search: undefined,
                      isActive: undefined,
                      page: undefined,
                    });
                  }
                : undefined
            }
          />
        ) : result ? (
          <>
            <div className="mt-4">
              <TaxTable taxes={result.data} sort={sort} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
              itemLabel="tax"
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
