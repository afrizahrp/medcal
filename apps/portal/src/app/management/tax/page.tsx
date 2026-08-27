import { Suspense } from "react";
import TaxPageClient from "./tax-page-client";

export default function TaxPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <TaxPageClient />
    </Suspense>
  );
}
