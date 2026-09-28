"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp } from "lucide-react";
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
  CalibrationJobFlatTable,
  CalibrationJobGroupTable,
  PageHeader,
  PaginationBar,
  Surface,
} from "./calibration-jobs-ui";
import { useCalibrationJobGroups, useCalibrationJobs } from "./use-calibration-jobs-query";

const URL_KEYS = [
  "search",
  "workOrderId",
  "purchaseOrderItemId",
  "status",
  "needsAction",
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

/**
 * Floating "back to top" control — an expanded Work Order's child list can
 * still run to hundreds of rows (search/filter is the intended way to *find*
 * a specific job; this just shortens the return trip once you're deep in an
 * unfiltered browse). Page-local: only this list currently has long enough
 * unfiltered child tables to need it.
 */
function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      const shouldShow = window.scrollY > 400;
      setVisible((prev) => (prev === shouldShow ? prev : shouldShow));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      // The global symbol-picker FAB (apps/portal/src/app/providers.tsx →
      // PortalSymbolPicker → GlobalSymbolPicker) already occupies the default
      // bottom-6/right-6 (sm:bottom-8/right-8) slot on every page, z-40. Reuse
      // the same "next slot up" convention PortalSymbolPicker itself already
      // uses to avoid EmailComposeFab, rather than an arbitrary offset.
      className="fixed bottom-24 right-6 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50 sm:bottom-28 sm:right-8"
      aria-label="Kembali ke atas"
      title="Kembali ke atas"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

export default function CalibrationJobsPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const workOrderId = params.workOrderId || undefined;
  const purchaseOrderItemId = params.purchaseOrderItemId || undefined;
  const jobStatus = params.status ?? "";
  const needsAction = params.needsAction === "true";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;
  const committedSearch = params.search ?? "";

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Once the list is scoped to one Work Order or one PO line item, switch from
  // the SPK-grouped view (all of a group's units rendered unpaginated) to the
  // flat, job-level-paginated view — the same trade that already works well
  // for browsing hundreds of units, reusing the flat endpoint's own
  // `skip`/`take` pagination rather than a new mechanism.
  const scoped = Boolean(workOrderId || purchaseOrderItemId);

  const sharedQueryParams = {
    search: committedSearch,
    workOrderId,
    purchaseOrderItemId,
    status: jobStatus,
    needsAction,
    sortBy: "",
    sortDir: "desc" as const,
    page,
    pageSize,
  };

  const groupedQuery = useCalibrationJobGroups(sharedQueryParams, !scoped);
  const flatQuery = useCalibrationJobs(sharedQueryParams, scoped);

  const groupedResult = groupedQuery.data;
  const flatResult = flatQuery.data;
  const groups = useMemo(() => groupedResult?.data ?? [], [groupedResult]);
  const flatRows = useMemo(() => flatResult?.data ?? [], [flatResult]);
  const isSearching = committedSearch.trim().length > 0;
  // Narrowing filters — like a text search, these already shrink each SPK's
  // child rows server-side, so the same "just show me the matches" auto-expand
  // applies without a manual click per group.
  const isFiltering = isSearching || needsAction;

  // Expand/collapse is view-only state kept in React (not the URL) — see
  // `syncExpandedToUrl`. Seeded once from the URL so links / reloads restore it.
  // Only meaningful in grouped mode.
  const initialExpandedParam = useSearchParams().get("expanded");
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(
    () => new Set(initialExpandedParam?.split(",").filter(Boolean) ?? []),
  );

  // When searching/filtering, auto-expand every SPK on the (already filtered)
  // page so the matching child job is visible without a manual click — mirrors
  // Calibration Parameter's search behavior over its Device-Name groups.
  const expandedIds = useMemo(() => {
    if (isFiltering) return new Set(groups.map((g) => g.workOrder.id));
    return manuallyExpanded;
  }, [isFiltering, groups, manuallyExpanded]);

  function toggle(workOrderId: string) {
    const next = new Set(manuallyExpanded);
    if (next.has(workOrderId)) next.delete(workOrderId);
    else next.add(workOrderId);
    setManuallyExpanded(next);
    syncExpandedToUrl(next);
  }

  const query = scoped ? flatQuery : groupedQuery;
  const loading = query.isLoading;
  // Dim only during a filter/page transition (stale placeholder shown), not on
  // the background poll — otherwise the table pulses every refetch interval.
  const fetching = query.isFetching && query.isPlaceholderData;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar calibration job." : null;
  const totalPages = scoped
    ? Math.max(1, flatResult?.totalPages ?? 1)
    : Math.max(1, groupedResult?.totalPages ?? 1);
  const hasFilters = Boolean(
    committedSearch || workOrderId || purchaseOrderItemId || jobStatus || needsAction,
  );
  const isEmpty = scoped ? flatRows.length === 0 : groups.length === 0;

  const { didClamp, dismiss } = usePaginationSync({
    page,
    totalPages: scoped ? flatResult?.totalPages : groupedResult?.totalPages,
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
          jobStatus={jobStatus}
          onJobStatusChange={(next) => setParams({ status: next || undefined, page: undefined })}
          needsAction={needsAction}
          onNeedsActionChange={(next) =>
            setParams({ needsAction: next ? "true" : undefined, page: undefined })
          }
          workOrderId={workOrderId}
          onClearWorkOrder={() => setParams({ workOrderId: undefined, page: undefined })}
          purchaseOrderItemId={purchaseOrderItemId}
          onClearPurchaseOrderItem={() =>
            setParams({ purchaseOrderItemId: undefined, page: undefined })
          }
        />

        {scoped
          ? flatResult && (
              <p className="mt-3 text-xs text-slate-500">{flatResult.total} calibration job</p>
            )
          : groupedResult && (
              <p className="mt-3 text-xs text-slate-500">
                {groupedResult.total} work order · {groupedResult.totalJobs} calibration job
              </p>
            )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : didClamp && isEmpty ? (
          <p className="mt-6 text-sm text-slate-400">Menyesuaikan halaman…</p>
        ) : isEmpty ? (
          <CalibrationJobEmptyState
            onClearFilters={
              hasFilters
                ? () => {
                    setSearchInput("");
                    setParams({
                      search: undefined,
                      workOrderId: undefined,
                      purchaseOrderItemId: undefined,
                      status: undefined,
                      needsAction: undefined,
                      page: undefined,
                    });
                  }
                : undefined
            }
          />
        ) : (
          <>
            <div className="mt-4">
              {scoped ? (
                <CalibrationJobFlatTable rows={flatRows} />
              ) : (
                <CalibrationJobGroupTable
                  groups={groups}
                  expandedIds={expandedIds}
                  onToggle={toggle}
                />
              )}
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={scoped ? (flatResult?.total ?? 0) : (groupedResult?.total ?? 0)}
              pageSize={pageSize}
              itemLabel={scoped ? "calibration job" : "work order"}
              // The grouped view paginates Work Orders, not the child job rows
              // an expanded Work Order can still render (up to hundreds) — the
              // default "Baris per halaman" wording would misleadingly read as
              // "at most N job rows". Only override it here; the scoped/flat
              // view's pageSize genuinely does cap visible job rows.
              pageSizeLabel={scoped ? undefined : "Work order per halaman"}
              onPageChange={(next) => setParams({ page: next <= 1 ? undefined : String(next) })}
              onPageSizeChange={(next) =>
                setParams({ pageSize: next === 10 ? undefined : String(next), page: undefined })
              }
            />
          </>
        )}
      </Surface>
      <ScrollToTopButton />
    </div>
  );
}
