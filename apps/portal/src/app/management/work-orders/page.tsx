import { Suspense } from "react";
import WorkOrdersPageClient from "./work-orders-page-client";

export default function WorkOrdersPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <WorkOrdersPageClient />
    </Suspense>
  );
}
