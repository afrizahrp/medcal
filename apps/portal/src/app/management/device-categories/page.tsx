import { Suspense } from "react";
import DeviceCategoriesPageClient from "./device-categories-page-client";

export default function DeviceCategoriesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DeviceCategoriesPageClient />
    </Suspense>
  );
}
