"use client";

import { useRequireSession } from "../../lib/use-require-session";
import { useNav } from "../../lib/use-nav";
import { SignOutButton } from "../../components/sign-out-button";
import { AccessDenied } from "../../components/access-denied";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { me, status } = useRequireSession();
  const { nav, loading: navLoading } = useNav("CUSTOMER", status === "ready");

  if (status === "loading" || (status === "ready" && navLoading)) {
    return <main className="p-8 text-slate-500">Loading…</main>;
  }

  if (status === "forbidden" || !me) {
    return <AccessDenied message="Your account does not have access to this application." />;
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">medcal Portal</span>
          <nav className="flex gap-4 text-sm text-slate-600">
            {nav.map((item) => (
              <a key={item.id ?? item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            {me.user.email} · {me.membership.role}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
