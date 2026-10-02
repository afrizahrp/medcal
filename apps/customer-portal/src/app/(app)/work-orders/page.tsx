"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ApiError } from "@medcal/shared";
import {
  CUSTOMER_CERTIFICATE_FILTER_VALUES,
  CUSTOMER_PROGRESS_FILTER_VALUES,
  CUSTOMER_WORK_ORDER_STATUS_VALUES,
} from "@medcal/shared";
import { ClearFiltersButton, FilterSelect, SearchBox } from "../../../components/list-controls";
import { PaginationBar } from "../../../components/pagination-bar";
import { ErrorState, LoadingState } from "../../../components/status-blocks";
import { CertificateCount, WorkOrderProgress, WorkOrderStatusBadge } from "../../../components/work-order-progress";
import {
  CERTIFICATE_OPTIONS,
  PROGRESS_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  hasActiveFilters,
  parsePage,
  pickFilterValue,
  type WorkOrderListParams,
} from "../../../lib/customer-work-orders";
import { usePaginationSync } from "../../../lib/use-pagination-sync";
import { useUrlQueryState } from "../../../lib/use-url-query-state";
import { useWorkOrderList } from "../../../lib/use-customer-queries";
import { emptyBlock } from "../../../lib/ui-classes";

const URL_KEYS = ["search", "status", "progress", "certificate", "page"] as const;

function WorkOrderListContent() {
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const listParams: WorkOrderListParams = {
    search: params.search ?? "",
    status: pickFilterValue(params.status, CUSTOMER_WORK_ORDER_STATUS_VALUES),
    progress: pickFilterValue(params.progress, CUSTOMER_PROGRESS_FILTER_VALUES),
    certificate: pickFilterValue(params.certificate, CUSTOMER_CERTIFICATE_FILTER_VALUES),
    page: parsePage(params.page),
  };

  const query = useWorkOrderList(listParams);
  const result = query.data;
  const filtered = hasActiveFilters(listParams);
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const updating = query.isFetching && !query.isLoading;

  usePaginationSync({
    page: listParams.page,
    totalPages: result?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  const resetPage = { page: undefined } as const;
  const clearAll = () =>
    setParams({ search: undefined, status: undefined, progress: undefined, certificate: undefined, page: undefined });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Progres Kalibrasi</h1>
      <p className="mt-1 text-sm text-slate-600">Pantau proses kalibrasi alat Anda.</p>

      <div className="mt-6 space-y-3">
        <SearchBox
          id="wo-search"
          label="Cari"
          placeholder="Nomor pengerjaan, nama alat, atau nomor seri"
          committed={listParams.search}
          onCommit={(value) => setParams({ search: value || undefined, ...resetPage })}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <FilterSelect
            id="wo-status"
            label="Status"
            value={listParams.status}
            options={WORK_ORDER_STATUS_OPTIONS}
            onChange={(value) => setParams({ status: value || undefined, ...resetPage })}
          />
          <FilterSelect
            id="wo-progress"
            label="Progres"
            value={listParams.progress}
            options={PROGRESS_OPTIONS}
            onChange={(value) => setParams({ progress: value || undefined, ...resetPage })}
          />
          <FilterSelect
            id="wo-certificate"
            label="Sertifikat"
            value={listParams.certificate}
            options={CERTIFICATE_OPTIONS}
            onChange={(value) => setParams({ certificate: value || undefined, ...resetPage })}
          />
        </div>
      </div>

      <div className={`mt-6 ${updating ? "opacity-70" : ""}`} aria-busy={updating}>
        {query.isLoading ? (
          <LoadingState label="Memuat daftar progress kalibrasi…" />
        ) : query.isError && forbidden ? (
          <ErrorState message="Akun Anda belum terhubung ke data pelanggan." />
        ) : query.isError ? (
          <ErrorState
            message="Data progress kalibrasi belum bisa dimuat. Coba lagi dalam beberapa saat."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : result && result.data.length === 0 && result.total === 0 ? (
          filtered ? (
            <div className={emptyBlock}>
              <h2 className="font-medium text-slate-900">Tidak ada daftar progress kalibrasi yang cocok</h2>
              <p className="mt-1 text-sm text-slate-600">Coba ubah kata kunci atau filter yang dipakai.</p>
              <ClearFiltersButton onClick={clearAll} />
            </div>
          ) : (
            <div className={emptyBlock}>
              <h2 className="font-medium text-slate-900">Belum ada Progress Kalibrasi</h2>
              <p className="mt-1 text-sm text-slate-600">Belum ada progress kalibrasi yang terhubung ke akun Anda.</p>
            </div>
          )
        ) : result ? (
          <>
            <ul className="space-y-3">
              {result.data.map((workOrder) => (
                <li key={workOrder.id}>
                  <Link
                    href={`/work-orders/${workOrder.id}`}
                    className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-all font-mono text-sm font-semibold text-slate-900">
                        {workOrder.number}
                      </p>
                      <WorkOrderStatusBadge status={workOrder.status} />
                    </div>
                    <div className="mt-3">
                      <WorkOrderProgress progress={workOrder.progress} />
                    </div>
                    <div className="mt-3">
                      <CertificateCount count={workOrder.certificates.availableCount} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <PaginationBar
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              itemLabel="progress kalibrasi"
              onPageChange={(next) => setParams({ page: next <= 1 ? undefined : String(next) })}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function WorkOrderListPage() {
  return (
    <Suspense fallback={<LoadingState label="Memuat progress kalibrasi…" fullPage />}>
      <WorkOrderListContent />
    </Suspense>
  );
}
