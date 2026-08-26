import { Suspense } from "react";
import DevicesPageClient from "./devices-page-client";

export default function DevicesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DevicesPageClient />
    </Suspense>
  );
}
