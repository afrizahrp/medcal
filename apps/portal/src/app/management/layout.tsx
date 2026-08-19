"use client";

import { useRequireSession } from "../../lib/use-require-session";
import { useNav } from "../../lib/use-nav";
import { ManagementShell } from "../../components/management/management-shell";
import { AccessDenied } from "../../components/access-denied";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const { me, status } = useRequireSession();
  const { nav, loading: navLoading } = useNav("MANAGEMENT", status === "ready");

  if (status === "loading" || (status === "ready" && navLoading)) {
    return <main className="p-8 text-slate-500">Loading…</main>;
  }

  if (status === "forbidden" || !me) {
    return <AccessDenied message="Your account does not have access to this application." />;
  }

  return (
    <ManagementShell me={me} nav={nav}>
      {children}
    </ManagementShell>
  );
}
