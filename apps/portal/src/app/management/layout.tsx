"use client";

import { useRequireSession } from "@medcal/auth/client";
import { useNav } from "../../lib/use-nav";
import { ManagementShell } from "../../components/management/management-shell";
import { DeviceManagementInfoPanel } from "../../components/management/device-management-info-panel";
import { CalibrationManagementInfoPanel } from "../../components/management/calibration-management-info-panel";
import { AccessDenied } from "../../components/access-denied";
import { PendingAuthorization } from "../../components/pending-authorization";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const { me, status } = useRequireSession();
  const { nav, loading: navLoading } = useNav("MANAGEMENT", status === "ready");

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
    <ManagementShell nav={nav}>
      <DeviceManagementInfoPanel nav={nav} />
      <CalibrationManagementInfoPanel nav={nav} />
      {children}
    </ManagementShell>
  );
}
