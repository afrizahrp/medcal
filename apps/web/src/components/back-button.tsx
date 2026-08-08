"use client";

import { useRouter } from "next/navigation";

export function BackButton({
  fallbackHref = "/layanan",
  label = "Kembali",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <div className="flex w-full justify-end">
      <button
        type="button"
        onClick={() => {
          const referrer = document.referrer;
          const sameOrigin =
            referrer.length > 0 &&
            (() => {
              try {
                return new URL(referrer).origin === window.location.origin;
              } catch {
                return false;
              }
            })();

          if (sameOrigin) {
            router.back();
            return;
          }
          router.push(fallbackHref);
        }}
        className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-800"
      >
        <span aria-hidden="true">←</span>
        {label}
      </button>
    </div>
  );
}
