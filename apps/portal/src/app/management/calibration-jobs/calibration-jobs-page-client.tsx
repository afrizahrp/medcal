"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { ViewAdjustedBanner } from "@/components/ui/view-adjusted-banner";
import { AccessDenied } from "../../../components/access-denied";
import {
  CalibrationJobEmptyState,
  CalibrationJobFilters,
  CalibrationJobGroupTable,
  PageHeader,
  PaginationBar,
  Surface,
} from "./calibration-jobs-ui";
import { useCalibrationJobGroups } from "./use-calibration-jobs-query";

const URL_KEYS = [
  "search",
  "workOrderId",
  "akdAklApprovalStatus",
  "status",
  "page",
  "pageSize",
] as const;

/**
 * Mirror the manual expand/collapse set into the URL (`?expanded=`) so a reload
 * or shared link keeps the same SPK rows open. Done via `history.replaceState` —
 * a pure view-state param that must never round-trip through the RSC router:
 * `router.replace()` to a bare pathname (collapsing the last open row) does not
 * reliably re-render `useSearchParams()` in the App Router, which is why React
 * state — not the URL — is the source of truth here. (Same approach as the
 * Calibration Parameter list.)
 */
function syncExpandedToUrl(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const next = new URLSearchParams(window.location.search);
  if (ids.size) next.set("expanded", [...ids].join(","));
  else next.delete("expanded");
  const qs = next.toString();
  window.history.replaceState(
    null,
    "",
    qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
  );
}

export default function CalibrationJobsPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const workOrderId = params.workOrderId || undefined;
  const approvalStatus = params.akdAklApprovalStatus ?? "";
  const jobStatus = params.status ?? "";
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

  const query = useCalibrationJobGroups({
    search: committedSearch,
    workOrderId,
    akdAklApprovalStatus: approvalStatus,
    status: jobStatus,
    sortBy: "",
    sortDir: "desc",
    page,
    pageSize,
  });

  const result = query.data;
  const groups = useMemo(() => result?.data ?? [], [result]);
  const isSearching = committedSearch.trim().length > 0;

  // Expand/collapse is view-only state kept in React (not the URL) — see
  // `syncExpandedToUrl`. Seeded once from the URL so links / reloads restore it.
  const initialExpandedParam = useSearchParams().get("expanded");
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(
    () => new Set(initialExpandedParam?.split(",").filter(Boolean) ?? []),
  );

  // When searching, auto-expand every SPK on the (already filtered) page so the
  // matching child job is visible without a manual click — mirrors Calibration
  // Parameter's search behavior over its Device-Name groups.
  const expandedIds = useMemo(() => {
    if (isSearching) return new Set(groups.map((g) => g.workOrder.id));
    return manuallyExpanded;
  }, [isSearching, groups, manuallyExpanded]);

  function toggle(workOrderId: string) {
    const next = new Set(manuallyExpanded);
    if (next.has(workOrderId)) next.delete(workOrderId);
    else next.add(workOrderId);
    setManuallyExpanded(next);
    syncExpandedToUrl(next);
  }

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

        {result ? (
          <p className="mt-3 text-xs text-slate-500">
            {result.total} work order · {result.totalJobs} calibration job
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : didClamp && groups.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Menyesuaikan halaman…</p>
        ) : groups.length === 0 ? (
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
        ) : (
          <>
            <div className="mt-4">
              <CalibrationJobGroupTable
                groups={groups}
                expandedIds={expandedIds}
                onToggle={toggle}
              />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result?.total ?? 0}
              pageSize={pageSize}
              itemLabel="work order"
              onPageChange={(next) => setParams({ page: next <= 1 ? undefined : String(next) })}
              onPageSizeChange={(next) =>
                setParams({ pageSize: next === 10 ? undefined : String(next), page: undefined })
              }
            />
          </>
        )}
      </Surface>
    </div>
  );
}
