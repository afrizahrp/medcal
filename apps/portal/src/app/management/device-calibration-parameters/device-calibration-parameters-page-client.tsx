"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../components/access-denied";
import {
  PageHeader,
  Surface,
  PaginationBar,
  DeviceCalibrationParameterSearchBar,
  DeviceTypeParameterTable,
  DeviceCalibrationParameterEmptyState,
} from "./device-calibration-parameters-ui";
import { useDeviceCalibrationParameterGroups } from "./use-device-calibration-parameters-query";

const URL_KEYS = ["search", "expanded", "page", "pageSize"] as const;

export default function DeviceCalibrationParametersPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const committedSearch = params.search ?? "";
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

  const query = useDeviceCalibrationParameterGroups({ search: committedSearch, page, pageSize });

  const manuallyExpanded = useMemo(
    () => new Set((params.expanded ?? "").split(",").filter(Boolean)),
    [params.expanded],
  );

  const result = query.data;
  const groups = result?.data ?? [];
  const isSearching = committedSearch.trim().length > 0;

  // When searching, auto-expand every Device Type on the (already filtered) page
  // so matches are visible without a manual click.
  const expandedIds = useMemo(() => {
    if (isSearching) return new Set(groups.map((g) => g.deviceType.id));
    return manuallyExpanded;
  }, [isSearching, groups, manuallyExpanded]);

  function toggle(deviceTypeId: string) {
    const next = new Set(manuallyExpanded);
    if (next.has(deviceTypeId)) next.delete(deviceTypeId);
    else next.add(deviceTypeId);
    setParams({ expanded: next.size ? [...next].join(",") : undefined });
  }

  if (!capabilities?.deviceCalibrationParameterRead) {
    return <AccessDenied />;
  }

  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar Calibration Parameter." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Calibration Parameter"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Calibration Parameter" }]}
        />

        {capabilities.deviceCalibrationParameterCreate ? (
          <Button asChild className="shrink-0">
            <Link href="/device-calibration-parameters/new">
              <Plus className="h-4 w-4" /> Calibration Parameter
            </Link>
          </Button>
        ) : null}
      </div>

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        <DeviceCalibrationParameterSearchBar value={searchInput} onChange={setSearchInput} />

        {result ? (
          <p className="mt-3 text-xs text-slate-500">
            {result.totalDeviceTypes} Device type dengan {result.totalParameters} parameter
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : groups.length === 0 ? (
          <DeviceCalibrationParameterEmptyState
            hasSearch={isSearching}
            onClearSearch={() => {
              setSearchInput("");
              setParams({ search: undefined, page: undefined });
            }}
          />
        ) : (
          <>
            <div className="mt-4">
              <DeviceTypeParameterTable
                groups={groups}
                expandedIds={expandedIds}
                onToggle={toggle}
                canCreate={Boolean(capabilities.deviceCalibrationParameterCreate)}
              />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result?.total ?? 0}
              pageSize={pageSize}
              itemLabel="device type"
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
