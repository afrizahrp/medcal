"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { useTableSort } from "@/hooks/use-table-sort";
import { cn } from "@/lib/utils";
import { ViewAdjustedBanner } from "@/components/ui/view-adjusted-banner";
import { AccessDenied } from "../../../components/access-denied";
import {
  PageHeader,
  Surface,
  DeviceCapabilityFilters,
  DeviceCapabilityTable,
  DeviceCapabilityEmptyState,
  PaginationBar,
} from "./device-capabilities-ui";
import { useDeviceCapabilities } from "./use-device-capabilities-query";

const URL_KEYS = ["search", "isActive", "sortBy", "sortDir", "page", "pageSize"] as const;

export default function DeviceCapabilitiesPageClient() {
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

  const query = useDeviceCapabilities({
    search: committedSearch,
    isActive,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  const { didClamp, dismiss } = usePaginationSync({
    page,
    totalPages: query.data?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  if (!capabilities?.deviceCapabilityRead) {
    return <AccessDenied />;
  }

  const result = query.data;
  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar Device Capability." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Device Capability"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Device Capability" }]}
        />

        {capabilities.deviceCapabilityCreate ? (
          <Button asChild className="shrink-0">
            <Link href="/device-capabilities/new">
              <Plus className="h-4 w-4" />
              Device Capability
            </Link>
          </Button>
        ) : null}
      </div>

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        {didClamp ? <ViewAdjustedBanner className="mb-4" onDismiss={dismiss} /> : null}

        <DeviceCapabilityFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          isActive={isActive}
          onIsActiveChange={(next) =>
            setParams({ isActive: next === "" ? undefined : String(next), page: undefined })
          }
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : didClamp && result && result.data.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Menyesuaikan halaman…</p>
        ) : result && result.data.length === 0 ? (
          <DeviceCapabilityEmptyState
            onClearFilters={
              committedSearch || isActive !== ""
                ? () => {
                    setSearchInput("");
                    setParams({ search: undefined, isActive: undefined, page: undefined });
                  }
                : undefined
            }
          />
        ) : result ? (
          <>
            <div className="mt-4">
              <DeviceCapabilityTable capabilities={result.data} sort={sort} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
              itemLabel="capability"
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
