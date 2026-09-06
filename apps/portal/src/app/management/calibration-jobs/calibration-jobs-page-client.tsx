"use client";

import { useEffect, useState } from "react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { useTableSort } from "@/hooks/use-table-sort";
import { cn } from "@/lib/utils";
import { ViewAdjustedBanner } from "@/components/ui/view-adjusted-banner";
import { AccessDenied } from "../../../components/access-denied";
import {
  CalibrationJobEmptyState,
  CalibrationJobFilters,
  CalibrationJobTable,
  PageHeader,
  PaginationBar,
  Surface,
} from "./calibration-jobs-ui";
import { useCalibrationJobs } from "./use-calibration-jobs-query";

const URL_KEYS = [
  "search",
  "workOrderId",
  "akdAklApprovalStatus",
  "status",
  "sortBy",
  "sortDir",
  "page",
  "pageSize",
] as const;

export default function CalibrationJobsPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const workOrderId = params.workOrderId || undefined;
  const approvalStatus = params.akdAklApprovalStatus ?? "";
  const jobStatus = params.status ?? "";
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

  const query = useCalibrationJobs({
    search: committedSearch,
    workOrderId,
    akdAklApprovalStatus: approvalStatus,
    status: jobStatus,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  const result = query.data;
  const loading = query.isLoading;
  // Dim only during a filter/page transition (stale placeholder shown), not on
  // the background poll — otherwise the table pulses every refetch interval.
  const fetching = query.isFetching && query.isPlaceholderData;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar calibration job." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;
  const hasFilters = Boolean(committedSearch || workOrderId || approvalStatus || jobStatus);

  const { didClamp, dismiss } = usePaginationSync({
    page,
    totalPages: result?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  if (!capabilities?.calibrationJobRead || forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader
        title="Calibration Jobs"
        crumbs={[{ href: "/", label: "Dashboard" }, { label: "Calibration Jobs" }]}
      />

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        {didClamp ? <ViewAdjustedBanner className="mb-4" onDismiss={dismiss} /> : null}

        <CalibrationJobFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          approvalStatus={approvalStatus}
          onApprovalStatusChange={(next) =>
            setParams({ akdAklApprovalStatus: next || undefined, page: undefined })
          }
          jobStatus={jobStatus}
          onJobStatusChange={(next) => setParams({ status: next || undefined, page: undefined })}
          workOrderId={workOrderId}
          onClearWorkOrder={() => setParams({ workOrderId: undefined, page: undefined })}
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : didClamp && result && result.data.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Menyesuaikan halaman…</p>
        ) : result && result.data.length === 0 ? (
          <CalibrationJobEmptyState
            onClearFilters={
              hasFilters
                ? () => {
                    setSearchInput("");
                    setParams({
                      search: undefined,
                      workOrderId: undefined,
                      akdAklApprovalStatus: undefined,
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
              <CalibrationJobTable jobs={result.data} sort={sort} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
              itemLabel="calibration job"
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
