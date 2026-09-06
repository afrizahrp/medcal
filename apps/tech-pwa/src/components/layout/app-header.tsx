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

export function AppHeader({
  title,
  showBack = false,
  onBack,
  leftSlot,
  rightSlot,
}: {
  title: string;
  showBack?: boolean;
  /** Custom back handler — overrides the default `router.back()`. */
  onBack?: () => void;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  const router = useRouter();

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
      <div className="flex min-h-11 min-w-11 items-center justify-center">{rightSlot}</div>
    </header>
  );
}
