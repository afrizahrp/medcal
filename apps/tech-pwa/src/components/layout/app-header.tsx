"use client";

import { useRouter } from "next/navigation";

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3 10.5 12 4l9 6.5M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppHeader({
  title,
  showBack = false,
  onBack,
  showHome,
  onHome,
  leftSlot,
  rightSlot,
}: {
  title: string;
  showBack?: boolean;
  /** Custom back handler — overrides the default `router.back()`. */
  onBack?: () => void;
  /**
   * Show a "Beranda" shortcut to the Job Saya list. Defaults to on for any
   * screen with a back button. Pass `false` to hide it.
   */
  showHome?: boolean;
  /**
   * Custom handler for the Beranda button — e.g. mid-wizard, to route through
   * the exit-confirm dialog instead of navigating away. When omitted the
   * button does a hard navigation to `/jobs` (reliable from the query-param
   * drill-down views, and gives a fresh load).
   */
  onHome?: () => void;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const homeVisible = (showHome ?? showBack) || Boolean(onHome);

  function goHome() {
    if (onHome) {
      onHome();
      return;
    }
    // Hard navigation — a client-side push to `/jobs` from a `/jobs?customerId=…`
    // drill-down does not reliably reset the list, and "Beranda" wanting fresh
    // data is a feature, not a cost.
    if (typeof window !== "undefined") {
      window.location.assign("/jobs");
    } else {
      router.push("/jobs");
    }
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-11 items-center gap-1 border-b border-slate-200 bg-white px-2 pt-safe-t">
      <div className="flex min-h-11 min-w-11 items-center justify-center">
        {leftSlot ??
          (showBack ? (
            <button
              type="button"
              onClick={() => (onBack ? onBack() : router.back())}
              aria-label="Kembali"
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
            >
              <BackIcon />
            </button>
          ) : null)}
      </div>
      <h1 className="flex-1 truncate text-base font-semibold text-slate-900">{title}</h1>
      <div className="flex min-h-11 min-w-11 items-center justify-end gap-1">
        {homeVisible ? (
          <button
            type="button"
            onClick={goHome}
            aria-label="Beranda (Job Saya)"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
          >
            <HomeIcon />
          </button>
        ) : null}
        {rightSlot}
      </div>
    </header>
  );
}
