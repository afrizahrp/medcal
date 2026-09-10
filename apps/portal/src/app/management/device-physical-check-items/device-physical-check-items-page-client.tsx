"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { ViewAdjustedBanner } from "@/components/ui/view-adjusted-banner";
import { AccessDenied } from "../../../components/access-denied";
import {
  PageHeader,
  Surface,
  PaginationBar,
  DevicePhysicalCheckItemSearchBar,
  DeviceTypePhysicalCheckItemTable,
  DevicePhysicalCheckItemEmptyState,
} from "./device-physical-check-items-ui";
import {
  useDevicePhysicalCheckItemGroups,
  useReorderDevicePhysicalCheckItems,
} from "./use-device-physical-check-items-query";

const URL_KEYS = ["search", "isActive", "page", "pageSize"] as const;

/**
 * Mirror the manual expand/collapse set into the URL (`?expanded=`) so a reload
 * or shared link keeps the same rows open. Done via `history.replaceState` — a
 * pure view-state param that must never round-trip through the RSC router.
 */
function syncExpandedToUrl(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const next = new URLSearchParams(window.location.search);
  if (ids.size) next.set("expanded", [...ids].join(","));
  else next.delete("expanded");
  const qs = next.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

export default function DevicePhysicalCheckItemsPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const committedSearch = params.search ?? "";
  const isActive: boolean | "" =
    params.isActive === "true" ? true : params.isActive === "false" ? false : "";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = useDevicePhysicalCheckItemGroups({
    search: committedSearch,
    isActive,
    page,
    pageSize,
  });

  const canReorder = Boolean(capabilities?.devicePhysicalCheckItemUpdate);
  const reorderMutation = useReorderDevicePhysicalCheckItems();
  const reorderHandlers = useMemo(
    () => ({
      onReorderItems: (deviceTypeId: string, itemIds: string[]) =>
        reorderMutation.mutate({ deviceTypeId, itemIds }),
    }),
    [reorderMutation],
  );
  const reorderError = reorderMutation.isError
    ? "Gagal menyimpan urutan baru — urutan dikembalikan seperti semula. Coba lagi."
    : null;

  const initialExpandedParam = useSearchParams().get("expanded");
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(
    () => new Set(initialExpandedParam?.split(",").filter(Boolean) ?? []),
  );

  const result = query.data;
  const groups = result?.data ?? [];
  const isSearching = committedSearch.trim().length > 0;

  const { didClamp, dismiss } = usePaginationSync({
    page,
    totalPages: result?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  const expandedIds = useMemo(() => {
    if (isSearching) return new Set(groups.map((g) => g.deviceType.id));
    return manuallyExpanded;
  }, [isSearching, groups, manuallyExpanded]);

  function toggle(deviceTypeId: string) {
    const next = new Set(manuallyExpanded);
    if (next.has(deviceTypeId)) next.delete(deviceTypeId);
    else next.add(deviceTypeId);
    setManuallyExpanded(next);
    syncExpandedToUrl(next);
  }

  if (!capabilities?.devicePhysicalCheckItemRead) {
    return <AccessDenied />;
  }

  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar Physical Inspection." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Physical Inspection"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Physical Inspection" }]}
        />

        {capabilities.devicePhysicalCheckItemCreate ? (
          <Button asChild className="shrink-0">
            <Link href="/device-physical-check-items/new">
              <Plus className="h-4 w-4" /> Physical Inspection
            </Link>
          </Button>
        ) : null}
      </div>

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        {didClamp ? <ViewAdjustedBanner className="mb-4" onDismiss={dismiss} /> : null}

        <DevicePhysicalCheckItemSearchBar
          value={searchInput}
          onChange={setSearchInput}
          isActive={isActive}
          onIsActiveChange={(next) =>
            setParams({ isActive: next === "" ? undefined : String(next), page: undefined })
          }
        />

        {result ? (
          <p className="mt-3 text-xs text-slate-500">
            {result.totalDeviceTypes} Device Name dengan {result.totalItems} item
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {reorderError ? <p className="mt-4 text-sm text-red-600">{reorderError}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : didClamp && groups.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Menyesuaikan halaman…</p>
        ) : groups.length === 0 ? (
          <DevicePhysicalCheckItemEmptyState
            hasSearch={isSearching || isActive !== ""}
            onClearSearch={() => {
              setSearchInput("");
              setParams({ search: undefined, isActive: undefined, page: undefined });
            }}
          />
        ) : (
          <>
            <div className="mt-4">
              <DeviceTypePhysicalCheckItemTable
                groups={groups}
                expandedIds={expandedIds}
                onToggle={toggle}
                canCreate={Boolean(capabilities.devicePhysicalCheckItemCreate)}
                canReorder={canReorder}
                reorder={reorderHandlers}
              />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result?.total ?? 0}
              pageSize={pageSize}
              itemLabel="device name"
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
