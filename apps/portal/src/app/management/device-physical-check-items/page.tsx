import { Suspense } from "react";
import DevicePhysicalCheckItemsPageClient from "./device-physical-check-items-page-client";

export default function DevicePhysicalCheckItemsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DevicePhysicalCheckItemsPageClient />
    </Suspense>
  );
}
