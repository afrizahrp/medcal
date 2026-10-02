import { buttonSecondary } from "../lib/ui-classes";

/**
 * Previous / next with a plain "page x of y · n items" summary. Page size is
 * fixed by the API, so there is no size picker (the management lists have one).
 */
export function PaginationBar({
  page,
  totalPages,
  total,
  itemLabel,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;

  return (
    <nav aria-label="Halaman" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600" aria-live="polite">
        Halaman {page} dari {totalPages} · {total} {itemLabel}
      </p>
      <div className="flex gap-2">
        <button type="button" className={buttonSecondary} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Sebelumnya
        </button>
        <button
          type="button"
          className={buttonSecondary}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </nav>
  );
}
