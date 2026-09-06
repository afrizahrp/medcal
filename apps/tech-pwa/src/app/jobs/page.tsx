"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Screen } from "../../components/layout/screen";
import { AccountMenu } from "../../components/layout/account-menu";
import { CardListSkeleton, EmptyState, ErrorState } from "../../components/ui/state-views";
import { formatApiError } from "../../lib/api-errors";
import { groupJobsByCustomer } from "../../lib/calibration/job-display";
import { useJobsQuery } from "./use-jobs-query";
import { JobsHierarchy } from "./jobs-ui";

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={["h-5 w-5", spinning ? "animate-spin" : ""].join(" ")}
      aria-hidden="true"
    >
      <path
        d="M4 4v5h5M20 20v-5h-5M4.5 9a8 8 0 0 1 14.13-3.36M19.5 15a8 8 0 0 1-14.13 3.36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Kembali"
      className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

function JobsPageContent() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");
  const workOrderId = searchParams.get("workOrderId");
  const { data, error, isPending, isError, refetch } = useJobsQuery();
  // Spin the refresh icon only for a user-initiated reload — the 6s background
  // poll runs silently (no per-tick flicker).
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const customers = data ? groupJobsByCustomer(data.data) : [];
  const activeCustomer = customerId
    ? customers.find((c) => c.customerId === customerId)
    : undefined;
  const activeSpk =
    activeCustomer && workOrderId
      ? activeCustomer.workOrders.find((w) => w.workOrderId === workOrderId)
      : undefined;

  let title = "Job Saya";
  let leftSlot: ReactNode = <AccountMenu />;
  if (customerId && workOrderId) {
    title = activeSpk?.workOrderNumber ?? "SPK";
    leftSlot = <BackLink href={`/jobs?customerId=${encodeURIComponent(customerId)}`} />;
  } else if (customerId) {
    title = activeCustomer?.customerName ?? "Pelanggan";
    leftSlot = <BackLink href="/jobs" />;
  }

  const incompleteFetch = Boolean(data && data.data.length < data.total);

  return (
    <Screen
      title={title}
      leftSlot={leftSlot}
      rightSlot={
        <button
          type="button"
          onClick={() => {
            setManualRefreshing(true);
            void refetch().finally(() => setManualRefreshing(false));
          }}
          aria-label="Muat ulang"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
        >
          <RefreshIcon spinning={manualRefreshing} />
        </button>
      }
    >
      {isPending ? <CardListSkeleton /> : null}

      {isError && !isPending ? (
        <ErrorState
          message={formatApiError(error, "Gagal memuat daftar job.")}
          onRetry={() => void refetch()}
        />
      ) : null}

      {data && data.data.length === 0 ? (
        <EmptyState
          title="Belum ada job yang ditugaskan ke Anda."
          subtitle="Job baru akan muncul setelah koordinator menugaskan Anda."
        />
      ) : null}

      {data && data.data.length > 0 ? (
        <>
          {incompleteFetch ? (
            <p className="px-4 pt-3 text-center text-xs text-amber-700">
              Data job belum lengkap ({data.data.length} dari {data.total}). Ringkasan di bawah
              mungkin tidak akurat — muat ulang atau hubungi koordinator.
            </p>
          ) : null}
          <JobsHierarchy jobs={data.data} customerId={customerId} workOrderId={workOrderId} />
        </>
      ) : null}
    </Screen>
  );
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <Screen title="Job Saya" leftSlot={<AccountMenu />}>
          <CardListSkeleton />
        </Screen>
      }
    >
      <JobsPageContent />
    </Suspense>
  );
}
