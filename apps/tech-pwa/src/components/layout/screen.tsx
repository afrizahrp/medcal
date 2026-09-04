import { AppHeader } from "./app-header";

export function Screen({
  title,
  showBack = false,
  leftSlot,
  rightSlot,
  footer,
  children,
}: {
  title: string;
  showBack?: boolean;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-100">
      <AppHeader title={title} showBack={showBack} leftSlot={leftSlot} rightSlot={rightSlot} />
      <main className="flex-1">{children}</main>
      {footer}
    </div>
  );
}
