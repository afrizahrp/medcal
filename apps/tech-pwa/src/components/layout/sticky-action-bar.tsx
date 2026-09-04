export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pb-safe-b pt-3">
      {children}
    </footer>
  );
}
