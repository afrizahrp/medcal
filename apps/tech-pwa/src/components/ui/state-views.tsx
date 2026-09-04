import { Button } from "./button";
import { Spinner } from "./spinner";

export function LoadingState({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-12 text-slate-500">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-900">{message}</p>
      <Button variant="secondary" fullWidth onClick={onRetry} className="max-w-xs">
        Coba lagi
      </Button>
    </div>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  );
}
