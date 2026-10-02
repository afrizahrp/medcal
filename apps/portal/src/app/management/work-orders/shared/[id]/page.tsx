"use client";

import { useParams } from "next/navigation";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { AccessDenied } from "../../../../../components/access-denied";
import { formPageClass } from "../../../quotations/quotations-ui";
import { PageHeader } from "../../work-orders-ui";
import { useSharedSpk } from "../../use-work-orders-query";
import { SharedSpkParentView } from "../../shared-spk-parent-view";

/** Read-only Parent SPK page — see SharedSpkParentView. */
export default function SharedSpkDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const query = useSharedSpk(params.id);
  const parent = query.data;

  if (isForbidden(query.error)) return <AccessDenied />;

  if (query.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="SPK tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/work-orders", label: "Work Orders" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">SPK induk tidak ditemukan.</p>
      </div>
    );
  }

  if (!parent) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat SPK induk.</p>
      </div>
    );
  }

  return (
    <SharedSpkParentView
      parent={parent}
      canRevise={Boolean(capabilities?.workOrderUpdate && capabilities?.workOrderAssign)}
    />
  );
}
