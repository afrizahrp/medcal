"use client";

import { useEffect, useState } from "react";
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
  DeviceModelFilters,
  DeviceModelTable,
  DeviceModelEmptyState,
  PaginationBar,
} from "./device-models-ui";
import { useDeviceModels } from "./use-device-models-query";
import { useDeviceTypes } from "../device-types/use-device-types-query";

const URL_KEYS = [
  "search",
  "deviceTypeId",
  "isActive",
  "sortBy",
  "sortDir",
  "page",
  "pageSize",
] as const;

export default function DeviceModelsPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const deviceTypeId = params.deviceTypeId ?? "";
  const isActive: boolean | "" =
    params.isActive === "true" ? true : params.isActive === "false" ? false : "";
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

  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const query = useDeviceModels({
    search: committedSearch,
    deviceTypeId,
    isActive,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  if (!capabilities?.deviceModelRead) {
    return <AccessDenied />;
  }

  const result = query.data;
  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar Device Model." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Device Model"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Device Model" }]}
        />

        {capabilities.deviceModelCreate ? (
          <Button asChild className="shrink-0">
            <Link href="/device-models/new">
              <Plus className="h-4 w-4" /> Device Model
            </Link>
          </Button>
        ) : null}
      </div>

      <Surface className={cn("mt-6 p-4 md:p-6", fetching && "opacity-70")}>
        <DeviceModelFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          deviceTypeId={deviceTypeId}
          onDeviceTypeChange={(next) =>
            setParams({ deviceTypeId: next || undefined, page: undefined })
          }
          deviceTypes={typesQuery.data?.data ?? []}
          isActive={isActive}
          onIsActiveChange={(next) =>
            setParams({ isActive: next === "" ? undefined : String(next), page: undefined })
          }
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : result && result.data.length === 0 ? (
          <DeviceModelEmptyState
            onClearFilters={
              committedSearch || deviceTypeId || isActive !== ""
                ? () => {
                    setSearchInput("");
                    setParams({
                      search: undefined,
                      deviceTypeId: undefined,
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
              <DeviceModelTable models={result.data} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
              itemLabel="model"
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
