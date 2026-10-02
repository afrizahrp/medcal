"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetchBlob } from "@medcal/shared";
import { CUSTOMER_CERTIFICATE_FILTER_VALUES, CUSTOMER_JOB_STATUS_VALUES } from "@medcal/shared";
import { ClearFiltersButton, FilterSelect, SearchBox } from "../../../../components/list-controls";
import { PaginationBar } from "../../../../components/pagination-bar";
import { WorkOrderFeedback } from "../../../../components/work-order-feedback";
import { ErrorState, LoadingState } from "../../../../components/status-blocks";
import { CertificateCount, WorkOrderProgress, WorkOrderStatusBadge } from "../../../../components/work-order-progress";
import {
  CERTIFICATE_OPTIONS,
  JOB_STATUS_OPTIONS,
  UNNAMED_DEVICE_LABEL,
  groupCertificateLabel,
  groupStatusSummary,
  groupUnitLabel,
  hasActiveFilters,
  jobStatusLabel,
  parsePage,
  pickFilterValue,
  unitDetailLines,
  unitTitle,
  type CustomerJob,
  type CustomerJobStatus,
  type CustomerUnitGroup,
  type CustomerWorkOrderSummary,
  type UnitGroupListParams,
} from "../../../../lib/customer-work-orders";
import { isUnauthorizedError } from "../../../../lib/customer-query";
import { openPdfFromGesture } from "../../../../lib/open-pdf";
import { expireSession } from "../../../../lib/session";
import { useWorkOrder, useWorkOrderJobs, useWorkOrderUnitGroups } from "../../../../lib/use-customer-queries";
import { usePaginationSync } from "../../../../lib/use-pagination-sync";
import { useUrlQueryState } from "../../../../lib/use-url-query-state";
import { buttonPrimary, emptyBlock, linkAction } from "../../../../lib/ui-classes";

const JOB_STATUS_CLASS: Record<CustomerJobStatus, string> = {
  NOT_STARTED: "text-slate-600",
  IN_PROGRESS: "text-amber-800",
  COMPLETED: "text-emerald-800",
};

/** Search/filters shared by the group list and each group's own unit list (the page number is separate). */
type ChildFilters = Omit<UnitGroupListParams, "page">;

const URL_KEYS = ["search", "status", "certificate", "page"] as const;

function JobCertificate({ job }: { job: CustomerJob }) {
  const [opening, setOpening] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const certificate = job.certificate;

  async function openPdf() {
    setPdfError(null);
    setOpening(true);
    try {
      await openPdfFromGesture({
        openWindow: () => window.open("", "_blank"),
        fetchBlob: () => apiFetchBlob(`/customer/calibration-jobs/${job.id}/certificate/pdf`),
        createObjectURL: (blob) => URL.createObjectURL(blob),
        navigateCurrent: (url) => window.location.assign(url),
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        void expireSession();
        return;
      }
      setPdfError(
        err instanceof ApiError && err.data?.code === "CERTIFICATE_PDF_UNAVAILABLE"
          ? "Sertifikat sudah terbit, tetapi file PDF belum tersedia."
          : "PDF belum bisa dibuka. Coba lagi.",
      );
    } finally {
      setOpening(false);
    }
  }

  // No certificate action unless a PDF can actually be opened: nothing is
  // rendered otherwise (no placeholder text, no certificate number/date).
  if (certificate.availability !== "AVAILABLE") return null;

  return (
    <div className="flex flex-col items-start sm:items-end">
      <button type="button" onClick={openPdf} disabled={opening} className={buttonPrimary}>
        {opening ? "Membuka…" : "Lihat sertifikat (PDF)"}
      </button>
      {pdfError ? (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {pdfError}
        </p>
      ) : null}
    </div>
  );
}

function UnitRow({ job, hideName = false }: { job: CustomerJob; hideName?: boolean }) {
  const detailLines = unitDetailLines(job.identity);
  return (
    <li className="px-4 py-3">
      <div className="min-w-0">
        {hideName ? null : <p className="break-words font-medium text-slate-900">{unitTitle(job.identity)}</p>}
        {detailLines.map((line, index) => (
          <p key={index} className="break-all text-sm text-slate-700">
            {line}
          </p>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className={`text-sm font-medium ${JOB_STATUS_CLASS[job.status]}`}>{jobStatusLabel(job.status)}</p>
        <JobCertificate job={job} />
      </div>
    </li>
  );
}

function WorkOrderHeader({ workOrder }: { workOrder: CustomerWorkOrderSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 break-all font-mono text-lg font-semibold text-slate-900">{workOrder.number}</h1>
        <WorkOrderStatusBadge status={workOrder.status} />
      </div>
      {workOrder.status === "CANCELLED" ? (
        <p className="mt-2 text-sm text-slate-600">Perintah kerja ini dibatalkan dan tetap tersimpan sebagai riwayat.</p>
      ) : null}
      <div className="mt-4">
        <WorkOrderProgress progress={workOrder.progress} showPercentage />
      </div>
      <div className="mt-3">
        <CertificateCount count={workOrder.certificates.availableCount} />
      </div>
    </div>
  );
}

/**
 * The units of one expanded group, fetched only once it is open and paginated
 * on its own. The same search/filters as the group list apply, so an
 * auto-expanded group lists just the matching units.
 */
function GroupUnits({
  workOrderId,
  group,
  filters,
}: {
  workOrderId: string;
  group: CustomerUnitGroup;
  filters: ChildFilters;
}) {
  const [page, setPage] = useState(1);
  const query = useWorkOrderJobs(workOrderId, { ...filters, group: group.key, page });
  const result = query.data;

  if (query.isLoading) return <LoadingState label="Memuat unit…" />;
  if (query.isError) {
    return (
      <ErrorState
        message="Unit belum bisa dimuat. Coba lagi dalam beberapa saat."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (!result || result.data.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate-600">Tidak ada unit yang cocok.</p>;
  }

  return (
    <div className={query.isFetching ? "opacity-70" : undefined} aria-busy={query.isFetching}>
      <ul className="divide-y divide-slate-200">
        {result.data.map((job) => (
          <UnitRow key={job.id} job={job} hideName={job.identity.name === group.name} />
        ))}
      </ul>
      {result.totalPages > 1 ? (
        <div className="border-t border-slate-200 px-4 pb-3">
          <PaginationBar
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            itemLabel="unit"
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Parent row of a group: what the order line is, how far along it is, and whether certificates can be opened. */
function UnitGroupCard({
  workOrderId,
  group,
  filters,
  expanded,
  onToggle,
}: {
  workOrderId: string;
  group: CustomerUnitGroup;
  filters: ChildFilters;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelId = `unit-group-${group.key}`;
  const certificateLabel = groupCertificateLabel(group.availableCertificates);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
      >
        <span className="min-w-0 flex-1">
          {/* Name and unit count share a row; a long name wraps in its own column and never reaches the count. */}
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words font-medium text-slate-900">
              {group.name ?? UNNAMED_DEVICE_LABEL}
            </span>
            <span className="shrink-0 whitespace-nowrap text-sm text-slate-700">{groupUnitLabel(group.total)}</span>
          </span>
          <span className="mt-1 block text-sm text-slate-600">{groupStatusSummary(group)}</span>
          {certificateLabel ? <span className="block text-sm text-slate-700">{certificateLabel}</span> : null}
        </span>
        <span
          aria-hidden="true"
          className={`mt-0.5 text-2xl leading-none text-slate-600 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      {expanded ? (
        <div id={panelId} role="region" aria-label={`Unit ${group.name ?? UNNAMED_DEVICE_LABEL}`} className="border-t border-slate-200 bg-slate-50/50">
          <GroupUnits workOrderId={workOrderId} group={group} filters={filters} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Group list for one page of results. Holds which groups the customer
 * toggled; it is remounted (key) whenever search/filters change, so a new
 * search starts from its default: collapsed, or open when a search or filter
 * is active so the matching units are visible straight away.
 */
function UnitGroupList({
  workOrderId,
  groups,
  filters,
  autoExpand,
}: {
  workOrderId: string;
  groups: CustomerUnitGroup[];
  filters: ChildFilters;
  autoExpand: boolean;
}) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const flip = (key: string) =>
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {groups.map((group) => {
        // A group of one unit is just that unit: no parent, nothing to expand.
        if (group.total === 1 && group.unit) return <UnitRow key={group.key} job={group.unit} />;
        const expanded = autoExpand ? !toggled.has(group.key) : toggled.has(group.key);
        return (
          <UnitGroupCard
            key={group.key}
            workOrderId={workOrderId}
            group={group}
            filters={filters}
            expanded={expanded}
            onToggle={() => flip(group.key)}
          />
        );
      })}
    </ul>
  );
}

function UnitsSection({ workOrderId }: { workOrderId: string }) {
  const { params, setParams } = useUrlQueryState(URL_KEYS);
  const groupParams: UnitGroupListParams = {
    search: params.search ?? "",
    status: pickFilterValue(params.status, CUSTOMER_JOB_STATUS_VALUES),
    certificate: pickFilterValue(params.certificate, CUSTOMER_CERTIFICATE_FILTER_VALUES),
    page: parsePage(params.page),
  };
  const query = useWorkOrderUnitGroups(workOrderId, groupParams);
  const result = query.data;
  const filtered = hasActiveFilters(groupParams);
  const updating = query.isFetching && !query.isLoading;
  // Child lists ignore the group page; they page on their own.
  const { page: _page, ...childFilters } = groupParams;

  usePaginationSync({
    page: groupParams.page,
    totalPages: result?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  const resetPage = { page: undefined } as const;
  const clearAll = () => setParams({ search: undefined, status: undefined, certificate: undefined, page: undefined });

  return (
    <section aria-labelledby="units-heading">
      <h2 id="units-heading" className="text-sm font-semibold text-slate-900">
        Unit kalibrasi
        {result ? <span className="ml-2 font-normal text-slate-600">({result.totalUnits})</span> : null}
      </h2>

      <div className="mt-3 space-y-3">
        <SearchBox
          id="unit-search"
          label="Cari unit"
          placeholder="Cari nama alat, merek, atau no. seri"
          committed={groupParams.search}
          onCommit={(value) => setParams({ search: value || undefined, ...resetPage })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <FilterSelect
            id="unit-status"
            label="Status"
            value={groupParams.status}
            options={JOB_STATUS_OPTIONS}
            onChange={(value) => setParams({ status: value || undefined, ...resetPage })}
          />
          <FilterSelect
            id="unit-certificate"
            label="Sertifikat"
            value={groupParams.certificate}
            options={CERTIFICATE_OPTIONS}
            onChange={(value) => setParams({ certificate: value || undefined, ...resetPage })}
          />
        </div>
      </div>

      <div className={`mt-4 ${updating ? "opacity-70" : ""}`} aria-busy={updating}>
        {query.isLoading ? (
          <LoadingState label="Memuat unit kalibrasi…" />
        ) : query.isError ? (
          <ErrorState
            message="Unit kalibrasi belum bisa dimuat. Coba lagi dalam beberapa saat."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : result && result.total === 0 ? (
          filtered ? (
            <div className={emptyBlock}>
              <h3 className="font-medium text-slate-900">Tidak ada unit yang cocok</h3>
              <p className="mt-1 text-sm text-slate-600">Coba ubah kata kunci atau filter yang dipakai.</p>
              <ClearFiltersButton onClick={clearAll} />
            </div>
          ) : (
            <p className="text-sm text-slate-600">Belum ada unit kalibrasi. Work Order ini belum dimulai.</p>
          )
        ) : result ? (
          <>
            <UnitGroupList
              key={JSON.stringify(childFilters)}
              workOrderId={workOrderId}
              groups={result.data}
              filters={childFilters}
              // Wait for the response that matches the filters: while the previous
              // results are still shown (placeholder), expanding them would fetch units for
              // groups that are about to disappear.
              autoExpand={filtered && !query.isPlaceholderData}
            />
            <PaginationBar
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              itemLabel="kelompok alat"
              onPageChange={(next) => setParams({ page: next <= 1 ? undefined : String(next) })}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

function WorkOrderDetailContent({ workOrderId }: { workOrderId: string }) {
  const query = useWorkOrder(workOrderId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/work-orders" className={linkAction}>
        ← Daftar Work Order
      </Link>

      <div className="mt-2">
        {query.isLoading ? (
          <LoadingState label="Memuat work order…" />
        ) : query.isError ? (
          query.error instanceof ApiError && query.error.status === 404 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h1 className="text-lg font-semibold text-slate-900">Work Order tidak ditemukan</h1>
              <p className="mt-1 text-sm text-slate-600">
                Perintah kerja ini tidak ada, atau tidak tersedia untuk akun Anda.
              </p>
            </div>
          ) : (
            <ErrorState
              message="Work order belum bisa dimuat. Coba lagi dalam beberapa saat."
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )
        ) : query.data ? (
          <div className="space-y-6">
            <WorkOrderHeader workOrder={query.data} />
            <WorkOrderFeedback workOrderId={workOrderId} />
            <UnitsSection workOrderId={workOrderId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<LoadingState label="Memuat work order…" fullPage />}>
      <WorkOrderDetailContent workOrderId={id} />
    </Suspense>
  );
}
