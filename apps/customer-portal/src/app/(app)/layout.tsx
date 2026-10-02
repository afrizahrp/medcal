import Link from "next/link";
import { AuthGate } from "../../components/auth-gate";
import { AppNav } from "../../components/app-nav";
import { SignOutButton } from "../../components/sign-out-button";

/**
 * Route group for every authenticated Customer Portal surface — everything
 * except /sign-in and /sign-in/register (siblings, outside this group).
 * Next.js route groups add no path segment, so this layout applies to `/`
 * and `/certificate/[token]` without changing their URLs.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-[100dvh]">
        <header className="flex flex-wrap items-center justify-between gap-x-2 border-b border-slate-200 bg-white px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-2">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-semibold text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Portal Pelanggan
            </Link>
            <AppNav />
          </div>
          <SignOutButton />
        </header>
        <main>{children}</main>
      </div>
    </AuthGate>
  );
}
