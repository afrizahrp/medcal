"use client";

import { useRequireSession } from "../../lib/use-require-session";
import { ManagementShell } from "../../components/management/management-shell";
import { managementNav } from "./nav-config";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
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

  const nav = managementNav.filter((item) => item.roles.includes(me.membership.role));

  return (
    <ManagementShell me={me} nav={nav}>
      {children}
    </ManagementShell>
  );
}
