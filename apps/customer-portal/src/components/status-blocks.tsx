import { buttonSecondary, errorBlock } from "../lib/ui-classes";

/**
 * The portal's one loading indicator: plain text, announced to assistive
 * technology, no animation. `fullPage` is for the gate that replaces the whole
 * screen; otherwise it sits inside a page section.
 */
export function LoadingState({ label = "Memuat…", fullPage = false }: { label?: string; fullPage?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={fullPage ? "p-8 text-center text-slate-600" : "text-slate-600"}
    >
      {label}
    </div>
  );
}

/**
 * The portal's one failure block: what went wrong in customer terms and, when
 * the failure is worth retrying, a button to do so. `role="alert"` so it is
 * announced when it appears.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  retrying = false,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className={errorBlock}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <p className={title ? "mt-1" : undefined}>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} disabled={retrying} className={`${buttonSecondary} mt-3`}>
          {retrying ? "Memuat…" : "Coba lagi"}
        </button>
      ) : null}
    </div>
  );
}
