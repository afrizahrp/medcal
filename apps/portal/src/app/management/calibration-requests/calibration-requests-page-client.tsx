"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../components/access-denied";
import {
  type CalibrationRequestStatus,
  CalibrationRequestEmptyState,
  CalibrationRequestFilters,
  CalibrationRequestTable,
  PageHeader,
  PaginationBar,
  Surface,
} from "./calibration-requests-ui";
import { useCalibrationRequests } from "./use-calibration-requests-query";

const URL_KEYS = ["search", "status", "sortBy", "sortDir", "page", "pageSize"] as const;

export default function CalibrationRequestsPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const status: CalibrationRequestStatus | "" =
    (params.status as CalibrationRequestStatus | undefined) ?? "";
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

  const query = useCalibrationRequests({
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
  const error = query.isError && !forbidden ? "Gagal memuat daftar requisition." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (!capabilities?.calibrationRequestRead || forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Requisitions"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Requisitions" }]}
        />

        {capabilities.calibrationRequestCreate ? (
          <div className="flex shrink-0 gap-2">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline">
                    <Link href="/calibration-requests/import">
                      <FileSpreadsheet className="h-4 w-4" />
                      Import Excel
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px]">
                  <p className="font-semibold text-slate-900">Format Excel</p>
                  <p className="mt-1 text-slate-600">Nama Alat · Model · Qty · Device ID</p>
                  <ul className="mt-1.5 space-y-0.5 text-slate-600">
                    <li>• Nama Alat: wajib</li>
                    <li>• Model: opsional</li>
                    <li>• Qty: wajib</li>
                    <li>• Device ID: opsional</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button asChild>
              <Link href="/calibration-requests/new">
                <Plus className="h-4 w-4" />
                Requisition
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        <CalibrationRequestFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          status={status}
          onStatusChange={(next) => setParams({ status: next || undefined, page: undefined })}
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : result && result.data.length === 0 ? (
          <CalibrationRequestEmptyState
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
              <CalibrationRequestTable requests={result.data} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
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
