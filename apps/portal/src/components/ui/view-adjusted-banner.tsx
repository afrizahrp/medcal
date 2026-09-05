import { AlertTriangle, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shown when `usePaginationSync` corrects a stale `page` value — tells the
 * user their view changed instead of letting the correction happen silently.
 */
export function ViewAdjustedBanner({
  onDismiss,
  className,
}: {
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Data telah berubah — halaman disesuaikan ke halaman terakhir yang tersedia.
      </span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup"
          className="text-amber-600 hover:text-amber-900"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
