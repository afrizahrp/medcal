"use client";

import { Screen } from "../../components/layout/screen";
import { AccountMenu } from "../../components/layout/account-menu";
import { CardListSkeleton, EmptyState, ErrorState } from "../../components/ui/state-views";
import { formatApiError } from "../../lib/api-errors";
import { useJobsQuery } from "./use-jobs-query";
import { JobsList } from "./jobs-ui";

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

export default function JobsPage() {
  const { data, error, isPending, isError, isFetching, refetch } = useJobsQuery();

  return (
    <Screen
      title="Job Saya"
      leftSlot={<AccountMenu />}
      rightSlot={
        <button
          type="button"
          onClick={() => void refetch()}
          aria-label="Muat ulang"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
        >
          <RefreshIcon spinning={isFetching} />
        </button>
      }
    >
      {isPending ? <CardListSkeleton /> : null}

      {isError && !isPending ? (
        <ErrorState message={formatApiError(error, "Gagal memuat daftar job.")} onRetry={() => void refetch()} />
      ) : null}

      {data && data.data.length === 0 ? (
        <EmptyState
          title="Belum ada job yang ditugaskan ke Anda."
          subtitle="Job baru akan muncul setelah koordinator menugaskan Anda."
        />
      ) : null}

      {data && data.data.length > 0 ? (
        <>
          <JobsList jobs={data.data} />
          {data.total > data.data.length ? (
            <p className="px-4 pb-3 text-center text-xs text-slate-500">
              Menampilkan {data.data.length} dari {data.total} job — hubungi koordinator.
            </p>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
