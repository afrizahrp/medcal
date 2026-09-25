import { AuthGate } from "../../components/auth-gate";
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
      <div className="min-h-screen">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="font-semibold text-brand-800">Customer Portal</span>
          <SignOutButton />
        </header>
        <main>{children}</main>
      </div>
    </AuthGate>
  );
}
