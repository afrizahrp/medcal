import { Suspense } from "react";
import QuotationsPageClient from "./quotations-page-client";

export default function QuotationsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <QuotationsPageClient />
    </Suspense>
  );
}
