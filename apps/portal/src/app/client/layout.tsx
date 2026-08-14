"use client";

import { useRequireSession } from "../../lib/use-require-session";
import { SignOutButton } from "../../components/sign-out-button";
import { clientNav } from "./nav-config";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { me, status } = useRequireSession();

  if (status === "loading") {
    return <main className="p-8 text-slate-500">Loading…</main>;
  }

  if (status === "forbidden" || !me) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="mt-2 text-slate-600">Your account does not have access to this application.</p>
      </main>
    );
  }

  const nav = clientNav.filter((item) => item.roles.includes(me.membership.role));

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">medcal Portal</span>
          <nav className="flex gap-4 text-sm text-slate-600">
            {nav.map((item) => (
              <a key={item.href} href={item.href}>
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
