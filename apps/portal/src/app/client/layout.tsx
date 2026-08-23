"use client";

import { useRequireSession, useAuth, useAuthz } from "@medcal/auth/client";
import { useNav } from "../../lib/use-nav";
import { SignOutButton } from "../../components/sign-out-button";
import { AccessDenied } from "../../components/access-denied";
import { PendingAuthorization } from "../../components/pending-authorization";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { me, status } = useRequireSession();
  const { user } = useAuth();
  const { membership } = useAuthz();
  const { nav, loading: navLoading } = useNav("CUSTOMER", status === "ready");

  if (status === "loading" || (status === "ready" && navLoading)) {
    return <main className="p-8 text-slate-500">Loading…</main>;
  }

  if (status === "pending") {
    return <PendingAuthorization />;
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
            {user?.email} · {membership?.role}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
