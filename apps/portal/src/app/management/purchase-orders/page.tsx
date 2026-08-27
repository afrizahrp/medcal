import { Suspense } from "react";
import PurchaseOrdersPageClient from "./purchase-orders-page-client";

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <PurchaseOrdersPageClient />
    </Suspense>
  );
}
