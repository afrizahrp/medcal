"use client";

import { useState } from "react";
import { useAuthz } from "@medcal/auth/client";
import { isForbidden, type DashboardPeriodPreset, type DashboardSummaryResponse } from "@medcal/shared";
import { AccessDenied } from "../../../components/access-denied";
import { useManagementDashboardQuery } from "../use-management-dashboard-query";

const PERIODS: { id: DashboardPeriodPreset; label: string }[] = [
  { id: "today", label: "Hari ini" },
  { id: "week", label: "Minggu ini" },
  { id: "month", label: "Bulan ini" },
  { id: "quarter", label: "Kuartal ini" },
  { id: "year", label: "Tahun ini" },
  { id: "custom", label: "Rentang khusus" },
];

const MOBILE_PERIODS = PERIODS.slice(0, 3);

type MetricSeries = DashboardSummaryResponse["period"]["volume"];

export default function CalibrationDashboardPage() {
  const { capabilities } = useAuthz();
  const [period, setPeriod] = useState<DashboardPeriodPreset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const summary = useManagementDashboardQuery(
    { period, from, to },
    Boolean(capabilities?.managementDashboardRead),
  );

  if (!capabilities?.managementDashboardRead) {
    return <AccessDenied message="Akun Anda tidak memiliki akses ke dashboard manajemen." />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-x-clip px-4 py-4 md:px-8 md:py-5">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-brand-900">Dashboard Manajemen</h2>
      </header>

      <section className="flex flex-col gap-2">
        <div>
          <h3 className="text-sm font-semibold text-brand-900">Kondisi saat ini</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Angka kondisi saat ini tidak mengikuti pemilih periode.
          </p>
        </div>
        {summary.data ? (
          <div className={currentStateGridClass}>
            <CurrentStateCard label="Work Order aktif" value={summary.data.currentState.activeWorkOrders} />
            <CurrentStateCard
              label="Job menunggu tindakan"
              value={summary.data.currentState.jobsAwaitingAction}
            />
            <CurrentStateCard
              label="Quotation menunggu persetujuan"
              value={summary.data.currentState.quotationsPendingApproval}
            />
          </div>
        ) : summary.isLoading ? (
          <CardSkeleton count={3} className="h-16" gridClassName={currentStateGridClass} />
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-brand-900">Performa periode</h3>
            <p className="mt-0.5 break-words text-xs text-slate-400">
              {summary.data
                ? `${summary.data.period.range.from} – ${summary.data.period.range.to}`
                : "Pilih periode untuk melihat angka."}
            </p>
          </div>
          <PeriodSelector
            period={period}
            from={from}
            to={to}
            onPeriod={setPeriod}
            onFrom={setFrom}
            onTo={setTo}
          />
        </div>
        {summary.isError ? (
          <ErrorState forbidden={isForbidden(summary.error)} onRetry={() => void summary.refetch()} />
        ) : null}
        {summary.data ? (
          <div className={periodGridClass}>
            <PeriodCard
              label="Customer PO"
              value={summary.data.period.customerPO.total}
              caption="Dokumen purchase order yang disetujui"
              series={summary.data.period.customerPO}
            />
            <PeriodCard
              label="Volume"
              value={summary.data.period.volume.total}
              caption="Unit fisik setelah Work Order dimulai"
              series={summary.data.period.volume}
            />
            <PeriodCard
              label="Terkalibrasi"
              value={summary.data.period.calibrated.total}
              caption="Unit diterima QA"
              series={summary.data.period.calibrated}
            />
          </div>
        ) : summary.isLoading ? (
          <CardSkeleton count={3} className="h-24" gridClassName={periodGridClass} />
        ) : null}
      </section>

      <section className="min-w-0 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="text-sm font-medium text-slate-600">Keuangan</h3>
          <p className="text-xs font-medium text-slate-400">Belum tersedia</p>
        </div>
        {summary.data ? (
          <>
            <ul className="mt-1.5 space-y-0.5 break-words text-xs leading-5 text-slate-500">
              <li>Pendapatan: {summary.data.financial.revenue} — tidak tersedia</li>
              <li>
                Nilai invoice belum tertagih: {summary.data.financial.outstandingInvoiceValue} — tidak
                tersedia
              </li>
            </ul>
            <p className="mt-1 text-xs leading-5 text-slate-400">{summary.data.financial.unavailableReason}</p>
          </>
        ) : (
          <p className="mt-1 text-xs text-slate-400">Modul penagihan belum diimplementasikan.</p>
        )}
      </section>
    </div>
  );
}

const currentStateGridClass = "grid grid-cols-1 items-start gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3";
const periodGridClass = "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3";

function CurrentStateCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
      <p className="text-sm leading-5 text-slate-500">{label}</p>
      <p className="mt-0.5 text-4xl font-semibold leading-none tracking-tight text-brand-900">{value}</p>
    </article>
  );
}

function PeriodCard({
  label,
  value,
  caption,
  series,
}: {
  label: string;
  value: number;
  caption: string;
  series: MetricSeries;
}) {
  return (
    <article className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
      <p className="text-sm leading-5 text-slate-500">{label}</p>
      <p className="mt-0.5 text-3xl font-semibold leading-none tracking-tight text-brand-900">{value}</p>
      <p className="mt-1 text-xs leading-4 text-slate-400">{caption}</p>
      <MiniTrend series={series} />
    </article>
  );
}

function MiniTrend({ series }: { series: MetricSeries }) {
  if (series.total === 0) {
    return <p className="mt-2 text-xs leading-4 text-slate-400">Tidak ada data pada periode ini.</p>;
  }
  const max = Math.max(...series.trend.map((point) => point.count), 1);
  return (
    <div className="mt-2 flex h-6 items-end gap-px" role="img" aria-label="Tren periode">
      {series.trend.map((point) => (
        <div key={point.bucketStart} className="flex h-full min-w-0 flex-1 items-end" title={`${point.label}: ${point.count}`}>
          <div
            className="w-full rounded-sm bg-brand-600/80"
            style={{ height: point.count === 0 ? "2px" : `${Math.max(12, (point.count / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function periodButtonClass(selected: boolean) {
  return selected
    ? "inline-flex min-h-11 items-center rounded-full bg-brand-800 px-3.5 text-sm font-medium text-white"
    : "inline-flex min-h-11 items-center rounded-full bg-white px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50";
}

function PeriodButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={periodButtonClass(selected)}>
      {label}
    </button>
  );
}

function PeriodSelector({
  period,
  from,
  to,
  onPeriod,
  onFrom,
  onTo,
}: {
  period: DashboardPeriodPreset;
  from: string;
  to: string;
  onPeriod: (period: DashboardPeriodPreset) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="hidden max-w-full flex-wrap gap-2 lg:flex" role="group" aria-label="Periode">
        {PERIODS.map((option) => (
          <PeriodButton
            key={option.id}
            label={option.label}
            selected={option.id === period}
            onClick={() => onPeriod(option.id)}
          />
        ))}
      </div>

      <div className="flex max-w-full flex-wrap gap-2 lg:hidden" role="group" aria-label="Periode">
        {MOBILE_PERIODS.map((option) => (
          <PeriodButton
            key={option.id}
            label={option.label}
            selected={option.id === period}
            onClick={() => onPeriod(option.id)}
          />
        ))}
      </div>

      {period === "custom" ? (
        <div className="hidden min-w-0 grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid">
          <label className="flex min-w-0 flex-col gap-1">
            Dari
            <input
              type="date"
              value={from}
              onChange={(event) => onFrom(event.target.value)}
              className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-slate-300 px-2"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            Sampai
            <input
              type="date"
              value={to}
              onChange={(event) => onTo(event.target.value)}
              className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-slate-300 px-2"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function CardSkeleton({
  count,
  className,
  gridClassName,
}: {
  count: number;
  className: string;
  gridClassName: string;
}) {
  return (
    <div className={gridClassName} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />
      ))}
    </div>
  );
}

function ErrorState({ forbidden, onRetry }: { forbidden: boolean; onRetry: () => void }) {
  if (forbidden) {
    return <AccessDenied message="Akun Anda tidak memiliki akses ke dashboard manajemen." />;
  }
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p>Dashboard tidak dapat dimuat.</p>
      <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-11 items-center font-medium underline">
        Coba lagi
      </button>
    </div>
  );
}
