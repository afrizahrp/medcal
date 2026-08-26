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
  DeviceCalibrationParameterFilters,
  DeviceCalibrationParameterTable,
  DeviceCalibrationParameterEmptyState,
  PaginationBar,
} from "./device-calibration-parameters-ui";
import { useDeviceCalibrationParameters } from "./use-device-calibration-parameters-query";
import {
  useDeviceCapabilities,
  useDeviceCapabilityItems,
} from "../device-capabilities/use-device-capabilities-query";
import { useDeviceTypes } from "../device-types/use-device-types-query";
import { useUoms } from "../uoms/use-uoms-query";

const URL_KEYS = [
  "search",
  "deviceTypeId",
  "capabilityId",
  "capabilityItemId",
  "uomId",
  "sortBy",
  "sortDir",
  "page",
  "pageSize",
] as const;

export default function DeviceCalibrationParametersPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const deviceTypeId = params.deviceTypeId ?? "";
  const capabilityId = params.capabilityId ?? "";
  const capabilityItemId = params.capabilityItemId ?? "";
  const uomId = params.uomId ?? "";
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

  const capabilitiesQuery = useDeviceCapabilities({
    search: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const itemsQuery = useDeviceCapabilityItems(capabilityId || undefined);

  const uomsQuery = useUoms({
    search: "",
    category: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const query = useDeviceCalibrationParameters({
    search: committedSearch,
    deviceTypeId,
    capabilityId,
    capabilityItemId,
    uomId,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  if (!capabilities?.deviceCalibrationParameterRead) {
    return <AccessDenied />;
  }

  const result = query.data;
  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const error = query.isError && !forbidden ? "Gagal memuat daftar Calibration Parameter." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;
  const hasFilters = Boolean(
    committedSearch || deviceTypeId || capabilityId || capabilityItemId || uomId,
  );

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
        <DeviceCalibrationParameterFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          deviceTypeId={deviceTypeId}
          onDeviceTypeChange={(next) =>
            setParams({ deviceTypeId: next || undefined, page: undefined })
          }
          deviceTypes={typesQuery.data?.data ?? []}
          capabilityId={capabilityId}
          onCapabilityChange={(next) =>
            setParams({
              capabilityId: next || undefined,
              capabilityItemId: undefined,
              page: undefined,
            })
          }
          capabilities={capabilitiesQuery.data?.data ?? []}
          capabilityItemId={capabilityItemId}
          onCapabilityItemChange={(next) =>
            setParams({ capabilityItemId: next || undefined, page: undefined })
          }
          capabilityItems={itemsQuery.data ?? []}
          uomId={uomId}
          onUomChange={(next) => setParams({ uomId: next || undefined, page: undefined })}
          uoms={uomsQuery.data?.data ?? []}
        />

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : result && result.data.length === 0 ? (
          <DeviceCalibrationParameterEmptyState
            onClearFilters={
              hasFilters
                ? () => {
                    setSearchInput("");
                    setParams({
                      search: undefined,
                      deviceTypeId: undefined,
                      capabilityId: undefined,
                      capabilityItemId: undefined,
                      uomId: undefined,
                      page: undefined,
                    });
                  }
                : undefined
            }
          />
        ) : result ? (
          <>
            <div className="mt-4">
              <DeviceCalibrationParameterTable parameters={result.data} />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result.total}
              pageSize={pageSize}
              itemLabel="parameter"
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
