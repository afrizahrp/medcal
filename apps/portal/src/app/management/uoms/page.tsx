import { Suspense } from "react";
import UomsPageClient from "./uoms-page-client";

export default function UomsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <UomsPageClient />
    </Suspense>
  );
}
