import { Suspense } from "react";
import PriceListItemsPageClient from "./price-list-items-page-client";

export default function PriceListItemsPage() {
  return (
    <Suspense
      fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}
    >
      <PriceListItemsPageClient />
    </Suspense>
  );
}
