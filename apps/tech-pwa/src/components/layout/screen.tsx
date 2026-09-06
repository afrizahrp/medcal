import { AppHeader } from "./app-header";

export function Screen({
  title,
  showBack = false,
  onBack,
  showHome,
  onHome,
  leftSlot,
  rightSlot,
  footer,
  children,
}: {
  title: string;
  showBack?: boolean;
  /** Custom back handler — overrides the default `router.back()`. */
  onBack?: () => void;
  /** Show the "Beranda" shortcut. Defaults to on when `showBack` is set. */
  showHome?: boolean;
  /** Custom Beranda handler — overrides the default hard nav to `/jobs`. */
  onHome?: () => void;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-100">
      <AppHeader
        title={title}
        showBack={showBack}
        onBack={onBack}
        showHome={showHome}
        onHome={onHome}
        leftSlot={leftSlot}
        rightSlot={rightSlot}
      />
      <main className="flex-1">{children}</main>
      {footer}
    </div>
  );
}
